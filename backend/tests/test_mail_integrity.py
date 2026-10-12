"""Mail remediation: concurrency, independent classifications and fixed label policy."""
import json
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from backend.models import InternalMail
from backend.tests.test_auth import application, client, csrf, login, register


def message(**changes):
    return {"to": [{"address": "alice@adminator.test"}], "subject": "Draft", "bodyText": "Original", **changes}


def test_draft_compare_and_swap_preserves_latest_and_requires_observed_revision(client):
    register(client); login(client)
    draft = client.post('/api/mail/drafts', json=message(), headers=csrf(client)).json()
    assert draft['revision'] == 1
    body = message(id=draft['id'], expectedRevision=1, bodyText='Latest')
    saved = client.post('/api/mail/drafts', json=body, headers=csrf(client))
    assert saved.status_code == 201 and saved.json()['revision'] == 2
    stale = client.post('/api/mail/drafts', json={**body, 'bodyText': 'Stale'}, headers=csrf(client))
    assert stale.status_code == 409
    assert client.post('/api/mail/drafts', json=message(id=draft['id']), headers=csrf(client)).status_code == 409
    assert client.get('/api/mail/emails/'+draft['id']).json()['bodyText'] == 'Latest'


def test_simultaneous_draft_saves_have_one_winner(client, application):
    register(client); login(client)
    draft = client.post('/api/mail/drafts', json=message(), headers=csrf(client)).json()
    headers = csrf(client)
    barrier = Barrier(2)
    def save(text):
        editor = TestClient(application)
        try:
            editor.cookies.update(client.cookies)
            barrier.wait(timeout=10)
            return editor.post('/api/mail/drafts', json=message(id=draft['id'], expectedRevision=1, bodyText=text), headers=headers)
        finally:
            editor.close()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, ['First editor', 'Second editor']))
    assert sorted(r.status_code for r in results) == [201, 409]
    winner = next(r.json() for r in results if r.status_code == 201)
    assert client.get('/api/mail/emails/'+draft['id']).json()['bodyText'] == winner['bodyText']


def test_simultaneous_draft_send_retries_commit_one_delivery(client, application):
    register(client); login(client)
    draft = client.post('/api/mail/drafts', json=message(), headers=csrf(client)).json()
    headers = csrf(client); barrier = Barrier(2)
    body = message(id=draft['id'], expectedRevision=1, clientId='same-send')
    def send(_):
        editor = TestClient(application)
        try:
            editor.cookies.update(client.cookies); barrier.wait(timeout=10)
            return editor.post('/api/mail/send',json=body,headers=headers)
        finally:
            editor.close()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(send, range(2)))
    assert [r.status_code for r in results]==[201,201]
    assert results[0].json()==results[1].json()
    assert len(client.get('/api/mail/emails').json()['items'])==2


def test_stale_draft_cannot_send_and_successful_send_retry_is_stable(client):
    register(client); login(client)
    draft = client.post('/api/mail/drafts', json=message(), headers=csrf(client)).json()
    updated = client.post('/api/mail/drafts', json=message(id=draft['id'], expectedRevision=1, bodyText='Latest'), headers=csrf(client)).json()
    assert client.post('/api/mail/send', json=message(id=draft['id'], expectedRevision=1, clientId='stale-send'), headers=csrf(client)).status_code == 409
    body = message(id=draft['id'], expectedRevision=updated['revision'], clientId='safe-send', bodyText='Latest')
    first = client.post('/api/mail/send', json=body, headers=csrf(client))
    assert first.status_code == 201 and first.json()['email']['revision'] == 3
    assert client.post('/api/mail/send', json=body, headers=csrf(client)).json() == first.json()
    assert len(client.get('/api/mail/emails').json()['items']) == 2


def test_receipts_have_personal_default_labels_and_category_to_cc_bcc_self(client, application):
    register(client); login(client)
    peers = []
    try:
        for username in ['Bob', 'Eve']:
            peer = TestClient(application); peer.__enter__(); peers.append(peer)
            register(peer, username); login(peer, username.lower())
        body = message(to=[{'address':'bob@adminator.test'}, {'address':'alice@adminator.test'}], cc=[{'address':'eve@adminator.test'}], bcc=[{'address':'eve@adminator.test'}], labels=['Work','Finance'], category='promotions', clientId='personal-labels')
        result = client.post('/api/mail/send', json=body, headers=csrf(client))
        assert result.status_code == 201
        assert result.json()['email']['labels'] == ['Work','Finance']
        assert result.json()['email']['category'] == 'promotions'
        for peer in [client, *peers]:
            receipts = [m for m in peer.get('/api/mail/emails').json()['items'] if m['folderId']=='inbox']
            assert len(receipts)==1
            assert receipts[0]['labels']==[] and receipts[0]['category']=='primary' and receipts[0]['bcc']==[]
            assert peers[1].get('/api/mail/emails/'+result.json()['email']['id']).status_code==404
    finally:
        for peer in peers: peer.__exit__(None,None,None)


@pytest.mark.parametrize('labels', [['Unsupported'], [None], [5], 'Work', {'Work':True}, ['W'*81], ['Work']*6])
def test_fixed_labels_reject_invalid_shape_length_and_supported_values(client, labels):
    register(client); login(client)
    valid = client.post('/api/mail/drafts', json=message(), headers=csrf(client)).json()
    for path, body in [('/api/mail/drafts', message(labels=labels)), ('/api/mail/send', message(labels=labels)), ('/api/mail/emails/'+valid['id'], {'labels':labels})]:
        method = client.patch if '/emails/' in path else client.post
        assert method(path, json=body, headers=csrf(client)).status_code==422


def test_label_duplicates_deduplicate_and_legacy_json_survives_unrelated_updates(client, application):
    register(client); login(client)
    draft = client.post('/api/mail/drafts', json=message(labels=['Work','Work','Team']), headers=csrf(client)).json()
    assert draft['labels']==['Work','Team']
    legacy_labels = ['Work','unmanaged',None,'Work']
    with application.state.session_factory() as db:
        row = db.get(InternalMail,draft['id']); raw=json.loads(row.data_json); raw['labels']=legacy_labels
        row.data_json=json.dumps(raw); db.commit()
    assert client.get('/api/mail/emails/'+draft['id']).json()['labels']==['Work']
    assert client.patch('/api/mail/emails/'+draft['id'],json={'isRead':False},headers=csrf(client)).json()['labels']==['Work']
    with application.state.session_factory() as db:
        assert json.loads(db.get(InternalMail,draft['id']).data_json)['labels']==legacy_labels
    client.patch('/api/mail/emails/'+draft['id'],json={'labels':['Team']},headers=csrf(client))
    with application.state.session_factory() as db:
        raw=json.loads(db.get(InternalMail,draft['id']).data_json)
        assert raw['labels']==['Team'] and raw['legacyLabels']==legacy_labels
