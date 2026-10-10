import { EmailError, normalizeEmail } from './model.js';

/** Proposed REST contract; dormant unless explicitly selected with a baseUrl. */
export class RestEmailApi {
  constructor({ baseUrl, accountId, fetchImpl = globalThis.fetch, mapEmail = normalizeEmail, headers = {}, authClient = null }) {
    if (!baseUrl || !accountId) throw new EmailError('CONFIG', 'REST mode requires baseUrl and accountId.');
    const url = new URL(baseUrl, globalThis.location?.href);
    if (!['http:', 'https:'].includes(url.protocol)) throw new EmailError('CONFIG', 'REST baseUrl must use HTTP(S).');
    this.baseUrl = `${url.href.replace(/\/$/, '')}/accounts/${encodeURIComponent(accountId)}`;
    this.fetch = fetchImpl.bind(globalThis); this.mapEmail = mapEmail; this.headers = headers; this.authClient = authClient;
  }
  async request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.fetch(this.baseUrl + path, {
        method, credentials: 'include', signal: controller.signal,
        headers: { ...this.headers, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' && this.authClient ? { 'X-CSRF-Token': this.authClient.csrfToken } : {}) },
        body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined,
      });
      if (!response.ok) { if (response.status === 401) this.authClient?.loseSession(); throw new EmailError(`HTTP_${response.status}`, `Email server returned ${response.status}.`); }
      return response.status === 204 ? null : await response.json();
    } catch (error) {
      if (error instanceof EmailError) throw error;
      throw new EmailError('NETWORK', error.name === 'AbortError' ? 'Email request timed out.' : 'Email server could not be reached.');
    } finally { clearTimeout(timer); }
  }
  async getEmails(query = {}) {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== ''));
    const result = await this.request(`/emails?${params}`);
    return { ...result, items: result.items.map(this.mapEmail) };
  }
  searchEmails(query) { return this.getEmails(typeof query === 'string' ? { query } : query); }
  async getEmailById(id) { return this.mapEmail(await this.request(`/emails/${encodeURIComponent(id)}`)); }
  async getThread(id) { return (await this.request(`/threads/${encodeURIComponent(id)}`)).map(this.mapEmail); }
  async sendEmail(data) {
    const result = await this.request('/send', { method: 'POST', body: data });
    return { ...result, email: this.mapEmail(result.email) };
  }
  async saveDraft(data) { return this.mapEmail(await this.request('/drafts', { method: 'POST', body: data })); }
  async updateDraft(id, data) { return this.mapEmail(await this.request(`/drafts/${encodeURIComponent(id)}`, { method: 'PATCH', body: data })); }
  async patch(id, body) { return this.mapEmail(await this.request(`/emails/${encodeURIComponent(id)}`, { method: 'PATCH', body })); }
  deleteEmail(id) { return this.moveEmail(id, 'trash'); }
  moveEmail(id, folderId) { return this.patch(id, { folderId }); }
  markAsRead(id) { return this.patch(id, { isRead: true }); }
  markAsUnread(id) { return this.patch(id, { isRead: false }); }
  async toggleStar(id) { return this.mapEmail(await this.request(`/emails/${encodeURIComponent(id)}/star`, { method: 'POST' })); }
  getFolders() { return this.request('/folders'); }
  getLabels() { return this.request('/labels'); }
  updateLabels(id, labels) { return this.patch(id, { labels }); }
  getAttachments(id) { return this.request(`/emails/${encodeURIComponent(id)}/attachments`); }
  uploadAttachment(file) { const body = new FormData(); body.append('file', file); return this.request('/attachments', { method: 'POST', body }); }
  async downloadAttachment(id) {
    // Backend returns a short-lived authorized download descriptor {name, type, dataUrl|url}.
    return this.request(`/attachments/${encodeURIComponent(id)}/download`);
  }
}
