"""A consistent, owner-scoped page/count read without decoding every mail body."""
import json
from sqlalchemy import select, func, case, exists
from backend.models import InternalMail

FOLDERS = ("inbox", "starred", "snoozed", "sent", "drafts", "spam", "trash", "archive")
LABELS = ("Work", "Team", "Finance", "Invoices", "Travel")


def python_mail_page(items, folder, query, label, category, read, starred, sort, offset, limit, summary, thread):
    def in_folder(item, name):
        return (item.get('isStarred') and item['folderId'] not in ('trash', 'spam', 'drafts')) if name == 'starred' else item['folderId'] == name
    def matches(item):
        text = ' '.join([item['from']['name'], item['from']['address'],
            *(p['address'] for k in ('to', 'cc', 'bcc') for p in item[k]), item['subject'], item['bodyText']]).lower()
        return (not folder or in_folder(item, folder)) and (not query or query.lower() in text) and \
            (not label or label in item['labels']) and (not category or category == item['category']) and \
            (read is None or item['isRead'] == read) and (not starred or item['isStarred']) and \
            (not thread or (item['threadId'] == thread and item['folderId'] not in ('trash', 'spam')))
    from datetime import datetime
    def timestamp(item):
        return datetime.fromisoformat((item.get('sentAt') or item.get('receivedAt') or item['updatedAt']).replace('Z', '+00:00')).timestamp()
    page = sorted(filter(matches, items), key=lambda item: ((1 if sort == 'oldest' else -1) * timestamp(item), item['id']))
    result = {'items': page[offset:offset + limit] if limit else page[offset:]}
    if summary:
        result.update(total=len(page), offset=offset, limit=limit,
            folders=[{'id': name, 'name': name.title(), 'total': sum(bool(in_folder(m, name)) for m in items),
                'unread': sum(bool(in_folder(m, name)) and not m['isRead'] for m in items)} for name in FOLDERS],
            labels=[{'id': name, 'name': name, 'total': sum(name in m['labels'] for m in items)} for name in LABELS])
    return result


def mailbox_page(db, uid, view, *, folder=None, query="", label=None, category=None, read=None,
                 starred=None, sort="newest", offset=0, limit=25, summary=False, thread=None):
    connection = db.connection()
    if connection.dialect.name != "sqlite":
        # Preserve the legacy portable contract; optimized SQLite is the tested runtime.
        items = [view(json.loads(row.data_json), row.revision) for row in db.scalars(select(InternalMail).where(InternalMail.owner_id == uid))]
        return python_mail_page(items, folder, query, label, category, read, starred, sort, offset, limit, summary, thread)
    # pysqlite does not BEGIN for SELECT. Pin all three reads to one snapshot so
    # another tab cannot change the label/folder counts between them.
    if not connection.connection.driver_connection.in_transaction:
        connection.exec_driver_sql("BEGIN")
    field = lambda key: func.json_extract(InternalMail.data_json, f"$.{key}")
    owner = InternalMail.owner_id == uid
    folder_of = field("folderId")
    star = (field("isStarred") == 1) & folder_of.not_in(("trash", "spam", "drafts"))

    def labelled(value):
        labels = func.json_each(InternalMail.data_json, '$.labels').table_valued('value', 'type').alias()
        return (field('labels').is_not(None) & (func.json_type(InternalMail.data_json, '$.labels') == 'array') &
            exists(select(1).select_from(labels).where(labels.c.type == 'text', labels.c.value == value).correlate(InternalMail)))

    conditions = [owner]
    if folder:
        conditions.append(star if folder == "starred" else folder_of == folder)
    if label:
        conditions.append(labelled(label))
    if category:
        conditions.append(field("category") == category)
    if read is not None:
        conditions.append(func.coalesce(field("isRead"), 0) == int(read))
    if starred:
        conditions.append(field("isStarred") == 1)
    if thread:
        conditions.extend([field("threadId") == thread, folder_of.not_in(("trash", "spam"))])
    if query:
        # Match the client haystack exactly, including field order and empty
        # recipient arrays; SQL LIKE wildcards remain literal user input.
        haystack = func.coalesce(field('from.name'), '').op('||')(' ').op('||')(func.coalesce(field('from.address'), ''))
        for recipient in ('to', 'cc', 'bcc'):
            addresses = func.json_each(InternalMail.data_json, f'$.{recipient}').table_valued('value').alias()
            piece = select(func.group_concat(func.json_extract(addresses.c.value, '$.address'), ' ')).select_from(addresses).correlate(InternalMail).scalar_subquery()
            haystack = haystack.op('||')(case((piece.is_not(None), func.coalesce(' ', '').op('||')(piece)), else_=''))
        for key in ('subject', 'bodyText'):
            haystack = haystack.op('||')(' ').op('||')(func.coalesce(field(key), ''))
        conditions.append(func.unicode_lower(haystack).contains(query.lower(), autoescape=True))
    page_query = select(InternalMail).where(*conditions)
    date = func.julianday(func.coalesce(field("sentAt"), field("receivedAt"), field("updatedAt")))
    page_query = page_query.order_by(date.asc() if sort == "oldest" else date.desc(), InternalMail.id)
    if limit is not None:
        page_query = page_query.offset(offset).limit(limit)
    rows = db.scalars(page_query).all()
    result = {"items": [view(json.loads(row.data_json), row.revision) for row in rows]}
    if not summary:
        return result
    result.update(total=db.scalar(select(func.count()).select_from(InternalMail).where(*conditions)), offset=offset, limit=limit)
    columns = []
    for name in FOLDERS:
        match = star if name == 'starred' else folder_of == name
        columns.extend([func.coalesce(func.sum(case((match, 1), else_=0)), 0),
            func.coalesce(func.sum(case((match & (func.coalesce(field('isRead'), 0) == 0), 1), else_=0)), 0)])
    columns.extend(func.coalesce(func.sum(case((labelled(name), 1), else_=0)), 0) for name in LABELS)
    totals = db.execute(select(*columns).where(owner)).one()
    result['folders'] = [{'id': name, 'name': name.title(), 'total': totals[i * 2], 'unread': totals[i * 2 + 1]} for i, name in enumerate(FOLDERS)]
    result['labels'] = [{'id': name, 'name': name, 'total': totals[len(FOLDERS) * 2 + i]} for i, name in enumerate(LABELS)]
    return result
