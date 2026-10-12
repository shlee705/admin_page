import { EmailError, FOLDERS, countLabels, matchesFolder, normalizeEmail, queryEmails, validateLabels } from './model.js';
export class InternalEmailApi {
  constructor({ authClient }) { this.client = authClient; this.revisions = new Map(); }
  observe(mail) { const result = normalizeEmail(mail); this.revisions.set(result.id, result.revision); return result; }
  draftBody(body) { const input = { ...body }; delete input.revision; return { ...input, labels: validateLabels(body.labels), ...(body.id ? { expectedRevision: body.expectedRevision ?? body.revision ?? this.revisions.get(body.id) } : {}) }; }
  request(path, options) { return this.client.request(`/api/mail${path}`, options); }
  async all() { return (await this.request('/emails')).items.map(mail => this.observe(mail)); }
  async getMailboxSnapshot(query = {}) {
    const params = new URLSearchParams({ summary: 'true', limit: String(query.limit || 25), offset: String(query.offset || 0) });
    for (const key of ['folderId', 'query', 'label', 'category', 'read', 'starred', 'sort']) {
      if (query[key] !== undefined && query[key] !== '') params.set(key, String(query[key]));
    }
    const result = await this.request(`/emails?${params}`);
    const items = result.items.map(mail => this.observe(mail));
    if (!result.folders) {
      // Legacy REST-shaped test adapters remain compatible with the old envelope.
      return { page: queryEmails(items, query), folders: FOLDERS.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), total: items.filter(m => matchesFolder(m, id)).length, unread: items.filter(m => matchesFolder(m, id) && !m.isRead).length })), labels: countLabels(items) };
    }
    return { page: { items, total: result.total, offset: result.offset, limit: result.limit }, folders: result.folders, labels: result.labels };
  }
  async getEmails(query = {}) { return (await this.getMailboxSnapshot(query)).page; }
  searchEmails(query) { return this.getEmails(typeof query === 'string' ? { query } : query); }
  async getEmailById(id) { return this.observe(await this.request(`/emails/${encodeURIComponent(id)}`)); }
  async getThread(id) { return (await this.request(`/emails?threadId=${encodeURIComponent(id)}&sort=oldest`)).items.map(mail => this.observe(mail)); }
  async sendEmail(body) {
    const fingerprint = JSON.stringify(body);
    if (this.pending?.fingerprint !== fingerprint) this.pending = { fingerprint, clientId: crypto.randomUUID(), body: this.draftBody(body) };
    const result = await this.request('/send', { method: 'POST', body: { ...this.pending.body, clientId: this.pending.clientId } });
    this.pending = null; return { ...result, email: this.observe(result.email) };
  }
  async saveDraft(body) { return this.observe(await this.request('/drafts', { method: 'POST', body: this.draftBody(body) })); }
  updateDraft(id, body) { return this.saveDraft({ ...body, id }); }
  async patch(id, body) { return this.observe(await this.request(`/emails/${encodeURIComponent(id)}`, { method: 'PATCH', body })); }
  deleteEmail(id) { return this.moveEmail(id, 'trash'); }
  moveEmail(id, folderId) { return this.patch(id, { folderId }); }
  markAsRead(id) { return this.patch(id, { isRead: true }); }
  markAsUnread(id) { return this.patch(id, { isRead: false }); }
  async toggleStar(id) { return this.observe(await this.request(`/emails/${encodeURIComponent(id)}/star`, { method: 'POST' })); }
  async updateLabels(id, labels) { return this.patch(id, { labels: validateLabels(labels) }); }
  async getFolders() { const mails = await this.all(); return FOLDERS.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), total: mails.filter(m => matchesFolder(m,id)).length, unread: mails.filter(m => matchesFolder(m,id) && !m.isRead).length })); }
  async getLabels() { return countLabels(await this.all()); }
  async getAttachments() { return []; }
  uploadAttachment() { return Promise.reject(new EmailError('CONFIG', 'Attachments are available in mock mode only. Internal delivery currently supports text.')); }
  downloadAttachment() { return Promise.reject(new EmailError('CONFIG', 'No internal attachment exists.')); }
}
