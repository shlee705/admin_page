import { EmailError, FOLDERS, LABELS, matchesFolder, queryEmails } from './model.js';
export class InternalEmailApi {
  constructor({ authClient }) { this.client = authClient; }
  request(path, options) { return this.client.request(`/api/mail${path}`, options); }
  async all() { return (await this.request('/emails')).items; }
  async getEmails(query = {}) { return queryEmails(await this.all(), query); }
  searchEmails(query) { return this.getEmails(typeof query === 'string' ? { query } : query); }
  getEmailById(id) { return this.request(`/emails/${encodeURIComponent(id)}`); }
  async getThread(id) { return (await this.all()).filter(mail => mail.threadId === id && !['trash','spam'].includes(mail.folderId)); }
  async sendEmail(body) {
    const fingerprint = JSON.stringify(body);
    if (this.pending?.fingerprint !== fingerprint) this.pending = { fingerprint, clientId: crypto.randomUUID() };
    const result = await this.request('/send', { method: 'POST', body: { ...body, clientId: this.pending.clientId } });
    this.pending = null; return result;
  }
  saveDraft(body) { return this.request('/drafts', { method: 'POST', body }); }
  updateDraft(id, body) { return this.saveDraft({ ...body, id }); }
  patch(id, body) { return this.request(`/emails/${encodeURIComponent(id)}`, { method: 'PATCH', body }); }
  deleteEmail(id) { return this.moveEmail(id, 'trash'); }
  moveEmail(id, folderId) { return this.patch(id, { folderId }); }
  markAsRead(id) { return this.patch(id, { isRead: true }); }
  markAsUnread(id) { return this.patch(id, { isRead: false }); }
  toggleStar(id) { return this.request(`/emails/${encodeURIComponent(id)}/star`, { method: 'POST' }); }
  updateLabels(id, labels) { return this.patch(id, { labels }); }
  async getFolders() { const mails = await this.all(); return FOLDERS.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), total: mails.filter(m => matchesFolder(m,id)).length, unread: mails.filter(m => matchesFolder(m,id) && !m.isRead).length })); }
  async getLabels() { return LABELS.map(id => ({ id, name: id })); }
  async getAttachments() { return []; }
  uploadAttachment() { return Promise.reject(new EmailError('CONFIG', 'Attachments are available in mock mode only. Internal delivery currently supports text.')); }
  downloadAttachment() { return Promise.reject(new EmailError('CONFIG', 'No internal attachment exists.')); }
}
