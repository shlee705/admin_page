/**
 * @typedef {{name: string, address: string}} MailAddress
 * @typedef {{id: string, name: string, size: number, type: string, available: boolean}} Attachment
 * @typedef {Object} Email
 * @property {string} id
 * @property {string} accountId
 * @property {?string} messageId
 * @property {string} threadId
 * @property {MailAddress} from
 * @property {MailAddress[]} to
 * @property {MailAddress[]} cc
 * @property {MailAddress[]} bcc
 * @property {string} subject
 * @property {string} bodyText
 * @property {string} bodyHtml
 * @property {?string} receivedAt
 * @property {?string} sentAt
 * @property {string} updatedAt
 * @property {boolean} isRead
 * @property {boolean} isStarred
 * @property {string} folderId
 * @property {string[]} labels
 * @property {number} revision Observed revision used for draft CAS.
 * @property {Attachment[]} attachments
 * @property {?string} inReplyTo
 * @property {string[]} references
 * @property {'primary'|'updates'|'promotions'} category
 * @property {'received'|'draft'|'queued'|'sent'|'failed'|'mock-sent'} deliveryStatus
 */

export class EmailError extends Error {
  constructor(code, message) { super(message); this.name = 'EmailError'; this.code = code; }
}
export const SELF = { name: 'John Doe', address: 'john@adminator.app' };
export const FOLDERS = ['inbox', 'starred', 'snoozed', 'sent', 'drafts', 'spam', 'trash', 'archive'];
export const LABELS = ['Work', 'Team', 'Finance', 'Invoices', 'Travel'];
/** Fixed labels: JSON array, at most five entries, exact spelling, first occurrence wins. */
export function validateLabels(labels = []) {
  if (!Array.isArray(labels) || labels.length > 5 || labels.some(label => typeof label !== 'string' || !label.length || label.length > 8 || !LABELS.includes(label))) {
    throw new EmailError('VALIDATION', 'Labels must be an array of at most five supported names: Work, Team, Finance, Invoices, Travel.');
  }
  return [...new Set(labels)];
}
/** Legacy values stay in persistence; only supported labels are shown and counted. */
export function visibleLabels(labels) {
  return Array.isArray(labels) ? [...new Set(labels.filter(label => LABELS.includes(label)))] : [];
}
/** Owner-scoped totals include every physical folder, including Trash and Spam. */
export function countLabels(emails) {
  return LABELS.map(id => ({ id, name: id, total: emails.filter(mail => visibleLabels(mail.labels).includes(id)).length }));
}
export const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;
export const ATTACHMENT_TYPES = ['text/plain', 'text/csv', 'application/pdf', 'image/png', 'image/jpeg', 'image/gif'];
export const clone = (value) => JSON.parse(JSON.stringify(value));

/** Convert API data at the boundary. REST deployments may inject a different mapper. */
export function normalizeEmail(data) {
  return {
    id: data.id, accountId: data.accountId, messageId: null, threadId: data.id,
    from: SELF, to: [], cc: [], bcc: [], subject: '', bodyText: '', bodyHtml: '',
    receivedAt: null, sentAt: null, updatedAt: new Date().toISOString(),
    isRead: false, isStarred: false, folderId: 'inbox', attachments: [],
    inReplyTo: null, references: [], category: 'primary', deliveryStatus: 'received', ...clone(data),
    labels: visibleLabels(data.labels), revision: Number.isSafeInteger(data.revision) && data.revision > 0 ? data.revision : 1,
  };
}

export function parseAddresses(value) {
  return String(value || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    .map((address) => ({ name: '', address }));
}

export function validateMessage(data, sending = false) {
  data.labels = validateLabels(data.labels);
  for (const field of ['to', 'cc', 'bcc']) {
    if (!Array.isArray(data[field])) throw new EmailError('VALIDATION', `${field} must be an address list.`);
    for (const person of data[field]) {
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(person.address)) {
        throw new EmailError('VALIDATION', `Invalid ${field} address: ${person.address}`);
      }
    }
  }
  if (sending && !data.to.length) throw new EmailError('VALIDATION', 'Enter at least one To recipient.');
  if (sending && !data.subject.trim()) throw new EmailError('VALIDATION', 'Enter a subject.');
  if (sending && !data.bodyText.trim()) throw new EmailError('VALIDATION', 'Enter a message.');
}

export function matchesFolder(email, folder) {
  return folder === 'starred'
    ? email.isStarred && !['trash', 'spam', 'drafts'].includes(email.folderId)
    : email.folderId === folder;
}

/** Server-side implementations accept the same query, returning a page envelope. */
export function queryEmails(emails, query = {}) {
  const text = String(query.query || '').toLowerCase();
  const filtered = emails.filter((mail) => {
    const haystack = [mail.from.name, mail.from.address, ...mail.to.map((p) => p.address),
      ...mail.cc.map((p) => p.address), ...mail.bcc.map((p) => p.address), mail.subject, mail.bodyText].join(' ').toLowerCase();
    return (!query.folderId || matchesFolder(mail, query.folderId)) && (!text || haystack.includes(text))
      && (!query.label || mail.labels.includes(query.label))
      && (!query.category || mail.category === query.category)
      && (query.read === undefined || mail.isRead === query.read)
      && (!query.starred || mail.isStarred);
  });
  filtered.sort((a, b) => {
    const diff = Date.parse(b.sentAt || b.receivedAt || b.updatedAt) - Date.parse(a.sentAt || a.receivedAt || a.updatedAt);
    return (query.sort === 'oldest' ? -diff : diff) || a.id.localeCompare(b.id);
  });
  const offset = Math.max(0, Number(query.offset) || 0);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 25));
  return { items: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit };
}
