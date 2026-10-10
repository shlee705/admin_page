import { describe, it, expect, vi } from 'vitest';
import { MockEmailApi } from '../src/assets/scripts/2026/email/mock-api.js';
import { createEmailService, EmailService } from '../src/assets/scripts/2026/email/service.js';
import { RestEmailApi } from '../src/assets/scripts/2026/email/rest-api.js';
import { initEmailPage } from '../src/assets/scripts/2026/email/ui.js';

const create = (options = {}) => new EmailService(new MockEmailApi({ latency: 0, ...options }));
const message = { to: 'sara@example.com', cc: 'leo@example.com', bcc: 'private@example.com', subject: 'Hello', bodyText: 'Test body' };

describe('Email service and mock persistence', () => {
  it('persists read, star, labels, archive and trash across service instances', async () => {
    const service = create();
    await service.markAsRead('sample-1'); await service.toggleStar('sample-1');
    await service.updateLabels('sample-1', ['Team']); await service.moveEmail('sample-1', 'archive');
    const persisted = await create().getEmailById('sample-1');
    expect(persisted).toMatchObject({ isRead: true, isStarred: false, labels: ['Team'], folderId: 'archive' });
    await service.markAsUnread('sample-1'); await service.deleteEmail('sample-1');
    expect(await create().getEmailById('sample-1')).toMatchObject({ isRead: false, folderId: 'trash' });
    expect((await service.getFolders()).find((f) => f.id === 'trash')).toMatchObject({ total: 2, unread: 1 });
  });
  it('queries virtual folders, all search fields, filters and paginated ordering', async () => {
    const service = create();
    expect((await service.getEmails({ folderId: 'starred' })).items.every((mail) => mail.isStarred)).toBe(true);
    for (const query of ['Sara', 'sara@northwind', 'john@adminator', 'pricing', 'launch plan']) {
      expect((await service.searchEmails({ query })).total).toBeGreaterThan(0);
    }
    const page = await service.getEmails({ folderId: 'inbox', read: false, label: 'Work', category: 'primary', limit: 1 });
    expect(page.total).toBe(2); expect(page.items).toHaveLength(1);
    const newest = await service.getEmails({ folderId: 'inbox', limit: 1 });
    const oldest = await service.getEmails({ folderId: 'inbox', sort: 'oldest', limit: 1 });
    expect(newest.items[0].id).not.toBe(oldest.items[0].id);
    expect((await service.getEmails({ folderId: 'inbox', offset: 1, limit: 1 })).items[0].id).not.toBe(newest.items[0].id);
  });
  it('saves and updates one draft, then sends it once with explicit mock delivery status', async () => {
    const service = create(); const draft = await service.saveDraft(message);
    await service.updateDraft(draft.id, { ...message, subject: 'Edited' });
    expect((await service.getEmails({ folderId: 'drafts' })).total).toBe(2);
    const result = await service.sendEmail({ ...message, id: draft.id, subject: 'Edited' });
    expect(result.status).toBe('mock-sent'); expect(result.email.folderId).toBe('sent');
    expect((await create().getEmails({ folderId: 'sent' })).total).toBe(2);
    await expect(service.sendEmail({ ...message, id: draft.id })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('validates To, Cc, Bcc, subject and body without writing invalid records', async () => {
    const service = create();
    for (const invalid of [{ to: '' }, { cc: 'bad' }, { bcc: 'bad' }, { subject: '' }, { bodyText: ' ' }]) {
      await expect(service.sendEmail({ ...message, ...invalid })).rejects.toMatchObject({ code: 'VALIDATION' });
    }
    expect((await service.getEmails({ folderId: 'sent' })).total).toBe(1);
    expect((await service.saveDraft({ subject: '', bodyText: '' })).folderId).toBe('drafts');
    await expect(service.moveEmail('sample-1', 'starred')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(service.updateLabels('sample-1', ['Unknown'])).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('constructs reply-all without self or duplicate recipients, hides original Bcc and retains thread references', async () => {
    const service = create();
    const reply = await service.composeFrom('sample-1', 'reply-all');
    expect(reply.to.map((p) => p.address)).toEqual(['sara@northwind.example']);
    expect(reply.cc.map((p) => p.address)).toEqual(['leo@adminator.example']);
    expect(reply.bcc).toEqual([]); expect(reply.inReplyTo).toBe('<sample-1@mock.adminator>');
    await service.sendEmail({ ...reply, bodyText: 'Reply body' });
    expect(await service.getThread('sample-1')).toHaveLength(3);
    const forward = await service.composeFrom('sample-1', 'forward');
    expect(forward.to).toEqual([]); expect(forward.threadId).toBeUndefined(); expect(forward.attachments).toHaveLength(1);
    expect((await service.composeFrom('sample-8', 'reply')).to.map((p) => p.address)).toEqual(['sara@northwind.example']);
  });
  it('persists actual uploaded file bytes and rejects unsupported, empty and oversized files', async () => {
    const service = create();
    const file = await service.uploadAttachment(new File(['hello'], 'note.txt', { type: 'text/plain' }));
    const result = await service.sendEmail({ ...message, attachments: [file] });
    expect(await service.getAttachments(result.email.id)).toEqual([file]);
    expect((await create().downloadAttachment(file.id)).dataUrl).toBe('data:text/plain;base64,aGVsbG8=');
    for (const invalid of [new File([], 'empty.txt', { type: 'text/plain' }), new File(['x'], 'script.html', { type: 'text/html' }), new File([new Uint8Array(2097153)], 'big.txt', { type: 'text/plain' })]) {
      await expect(service.uploadAttachment(invalid)).rejects.toMatchObject({ code: 'VALIDATION' });
    }
    await expect(service.downloadAttachment('sample-attachment')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('isolates accounts and test namespaces and resets only the selected mailbox', async () => {
    const a = create({ accountId: 'a', namespace: 'test-1' });
    const b = create({ accountId: 'b', namespace: 'test-1' });
    await a.deleteEmail('sample-1');
    expect((await b.getEmailById('sample-1')).folderId).toBe('inbox');
    expect((await create({ accountId: 'a', namespace: 'test-2' }).getEmailById('sample-1')).folderId).toBe('inbox');
    await a.reset(); expect((await a.getEmailById('sample-1')).folderId).toBe('inbox');
  });
  it('rejects once asynchronously and recovers without mutating failed operations', async () => {
    const service = create(); service.failNext();
    const request = service.deleteEmail('sample-1'); expect(request).toBeInstanceOf(Promise);
    await expect(request).rejects.toMatchObject({ code: 'NETWORK' });
    expect((await service.getEmailById('sample-1')).folderId).toBe('inbox');
    await expect(service.getEmailById('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const storage = { getItem: () => null, setItem: () => { throw Error('Quota'); } };
    await expect(create({ storage }).getEmails()).rejects.toMatchObject({ code: 'STORAGE' });
  });
  it('serializes concurrent mutations to prevent lost writes', async () => {
    const service = create();
    await Promise.all([service.toggleStar('sample-2'), service.markAsRead('sample-2'), service.updateLabels('sample-2', ['Finance'])]);
    expect(await service.getEmailById('sample-2')).toMatchObject({ isStarred: true, isRead: true, labels: ['Finance'] });
  });
  it('reports corrupt persistence and recovers with an explicit reset', async () => {
    const service = create(); localStorage.setItem(service.api.key, '{bad json');
    await expect(service.getEmails()).rejects.toMatchObject({ code: 'STORAGE' });
    expect(localStorage.getItem(service.api.key)).toBe('{bad json');
    await service.reset(); expect((await service.getEmails()).total).toBe(12);
  });
});

describe('REST boundary', () => {
  it('makes no requests in default mock mode or invalid REST configuration', () => {
    const fetch = vi.spyOn(globalThis, 'fetch'); createEmailService();
    expect(() => createEmailService({ mode: 'rest' })).toThrow('baseUrl'); expect(fetch).not.toHaveBeenCalled();
  });
  it('maps responses, preserves queued send status and handles HTTP failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [{ id: 'server-1' }], total: 1 }) });
    const api = new RestEmailApi({ baseUrl: 'https://mail.example.test/api', accountId: 'a/b', fetchImpl });
    expect((await api.getEmails({ read: false, query: 'hello' })).items[0].folderId).toBe('inbox');
    expect(fetchImpl.mock.calls[0][0]).toContain('/accounts/a%2Fb/emails?read=false&query=hello');
    fetchImpl.mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ email: { id: 'queued-1', deliveryStatus: 'queued' }, status: 'queued', requestId: 'r1' }) });
    expect((await api.sendEmail(message)).status).toBe('queued');
    fetchImpl.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(api.getFolders()).rejects.toMatchObject({ code: 'HTTP_401' });
  });
});

describe('Email DOM behavior', () => {
  it('escapes untrusted email content and exposes operation errors in the DOM', async () => {
    document.body.dataset.active = 'email'; document.body.innerHTML = '<main data-email-app></main>';
    const service = create(); const result = await service.sendEmail({ ...message, subject: '<img src=x onerror=alert(1)>', bodyText: '<script>bad()</script>' });
    await service.moveEmail(result.email.id, 'inbox'); await initEmailPage({ service });
    expect(document.querySelector('[data-message-list] img')).toBeNull();
    document.querySelector(`[data-open="${result.email.id}"]`).click();
    await vi.waitFor(() => expect(document.querySelector('[data-reader]').textContent).toContain('<script>bad()</script>'));
    expect(document.querySelector('[data-reader] script')).toBeNull();
    await vi.waitFor(() => expect(document.querySelector('[data-email-app]').getAttribute('aria-busy')).toBe('false'));
    service.failNext(); document.querySelector('[data-action="refresh"]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-error]').textContent).toContain('Simulated network failure'));
    await vi.waitFor(() => expect(document.querySelector('[data-email-app]').getAttribute('aria-busy')).toBe('false'));
  });
  it('mounts folders and selection, marks read, renders safe text and updates unread status', async () => {
    document.body.dataset.active = 'email'; document.body.innerHTML = '<main data-email-app></main>';
    const service = create(); await initEmailPage({ service });
    expect(document.querySelector('[data-testid="folder-inbox"]').textContent).toContain('7 / 3');
    document.querySelector('[data-open="sample-1"]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="email-detail"]').textContent).toContain('Q2 launch plan'));
    await vi.waitFor(() => expect(document.querySelector('[data-email-app]').getAttribute('aria-busy')).toBe('false'));
    expect(document.querySelector('[data-testid="email-row-sample-1"]').dataset.read).toBe('true');
    document.querySelector('[data-action="toggle-read"]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="email-row-sample-1"]').dataset.read).toBe('false'));
    await vi.waitFor(() => expect(document.querySelector('[data-email-app]').getAttribute('aria-busy')).toBe('false'));
    document.querySelector('[data-action="delete"]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="email-row-sample-1"]')).toBeNull());
  });
});
