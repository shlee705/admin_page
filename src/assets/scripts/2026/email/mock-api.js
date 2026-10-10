import { clone, EmailError, FOLDERS, LABELS, matchesFolder, normalizeEmail, queryEmails, SELF } from './model.js';
import { seedEmails } from './seed.js';

/** Async persistence boundary. Instances for different accounts/namespaces never share records. */
export class MockEmailApi {
  constructor({ accountId = 'demo', namespace = 'default', storage, latency = 100, persistence = null, identity = SELF } = {}) {
    this.accountId = accountId;
    this.key = `adminator-email:v1:${encodeURIComponent(namespace)}:${encodeURIComponent(accountId)}`;
    this.storage = storage || (persistence ? null : globalThis.localStorage);
    this.persistence = persistence;
    this.identity = identity;
    this.latency = latency;
    this.failure = null;
    this.queue = Promise.resolve();
  }
  failNext(message = 'Simulated network failure') { this.failure = message; }
  async execute(operation) {
    const task = this.queue.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, this.latency));
      if (this.failure) { const message = this.failure; this.failure = null; throw new EmailError('NETWORK', message); }
      let state;
      try {
        const raw = this.persistence ? await this.persistence.load() : this.storage.getItem(this.key);
        state = raw ? this.persistence ? raw : JSON.parse(raw) : { version: 1, emails: seedEmails(this.accountId, this.identity), files: {} };
        if (state.version !== 1 || !Array.isArray(state.emails) || !state.files) throw Error('Invalid mailbox');
      } catch (error) {
        if (this.persistence) throw error;
        throw new EmailError('STORAGE', `Cannot read mailbox: ${error.message}. Use Reset mock data to recover.`);
      }
      const result = await operation(state);
      try { if (this.persistence) await this.persistence.save(state); else this.storage.setItem(this.key, JSON.stringify(state)); }
      catch (error) { if (this.persistence) throw error; throw new EmailError('STORAGE', 'Mailbox could not be saved. Browser storage is full or unavailable.'); }
      return clone(result);
    });
    this.queue = task.catch(() => {});
    return task;
  }
  find(state, id) {
    const mail = state.emails.find((item) => item.id === id && item.accountId === this.accountId);
    if (!mail) throw new EmailError('NOT_FOUND', 'Email not found.');
    return mail;
  }
  getEmails(query = {}) { return this.execute((state) => queryEmails(state.emails, query)); }
  searchEmails(query) { return this.getEmails(typeof query === 'string' ? { query } : query); }
  getEmailById(id) { return this.execute((state) => this.find(state, id)); }
  getThread(threadId) { return this.execute((state) => state.emails.filter((e) => e.threadId === threadId && !['trash', 'spam'].includes(e.folderId)).sort((a, b) => Date.parse(a.sentAt || a.receivedAt || a.updatedAt) - Date.parse(b.sentAt || b.receivedAt || b.updatedAt))); }
  mutate(id, changes) { return this.execute((state) => {
    const mail = this.find(state, id); Object.assign(mail, typeof changes === 'function' ? changes(mail) : changes, { updatedAt: new Date().toISOString() }); return mail;
  }); }
  deleteEmail(id) { return this.moveEmail(id, 'trash'); }
  moveEmail(id, folderId) {
    if (!FOLDERS.includes(folderId) || ['starred', 'drafts', 'sent'].includes(folderId)) return Promise.reject(new EmailError('VALIDATION', 'Invalid destination folder.'));
    return this.execute((state) => {
      const mail = this.find(state, id);
      if (mail.folderId === 'drafts' && folderId !== 'trash') throw new EmailError('VALIDATION', 'Save or send the draft before moving it.');
      mail.folderId = folderId; mail.updatedAt = new Date().toISOString(); return mail;
    });
  }
  markAsRead(id) { return this.mutate(id, { isRead: true }); }
  markAsUnread(id) { return this.mutate(id, { isRead: false }); }
  toggleStar(id) { return this.mutate(id, (mail) => ({ isStarred: !mail.isStarred })); }
  updateLabels(id, labels) {
    if (labels.some((label) => !LABELS.includes(label))) return Promise.reject(new EmailError('VALIDATION', 'Unknown label.'));
    return this.mutate(id, { labels: [...new Set(labels)] });
  }
  getFolders() { return this.execute((state) => FOLDERS.map((id) => {
    const mails = state.emails.filter((e) => matchesFolder(e, id));
    return { id, name: id[0].toUpperCase() + id.slice(1), virtual: id === 'starred', total: mails.length, unread: mails.filter((e) => !e.isRead).length };
  })); }
  getLabels() { return this.execute((state) => LABELS.map((name) => ({ id: name, name, total: state.emails.filter((e) => e.labels.includes(name)).length }))); }
  createMessage(state, data, folderId) {
    const id = globalThis.crypto.randomUUID();
    this.checkAttachments(state, data.attachments || []);
    const mail = normalizeEmail({ ...data, id, accountId: this.accountId, from: this.identity, folderId,
      threadId: data.threadId || id, messageId: folderId === 'sent' ? `<${id}@mock.adminator>` : null,
      isRead: true, deliveryStatus: folderId === 'sent' ? 'mock-sent' : 'draft',
      sentAt: folderId === 'sent' ? new Date().toISOString() : null, receivedAt: null });
    state.emails.push(mail); return mail;
  }
  checkAttachments(state, attachments) {
    for (const attachment of attachments) {
      if (attachment.available && !state.files[attachment.id]) throw new EmailError('NOT_FOUND', 'Attachment no longer available. Please upload it again.');
    }
  }
  sendEmail(data) { return this.execute((state) => {
    if (data.id) {
      const draft = this.find(state, data.id);
      if (draft.folderId !== 'drafts') throw new EmailError('CONFLICT', 'Only drafts can be sent again.');
      this.checkAttachments(state, data.attachments || []);
      Object.assign(draft, data, { folderId: 'sent', from: this.identity, sentAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deliveryStatus: 'mock-sent', isRead: true, messageId: `<${draft.id}@mock.adminator>` });
      return { email: draft, status: 'mock-sent', requestId: globalThis.crypto.randomUUID() };
    }
    return { email: this.createMessage(state, data, 'sent'), status: 'mock-sent', requestId: globalThis.crypto.randomUUID() };
  }); }
  saveDraft(data) { return this.execute((state) => this.createMessage(state, data, 'drafts')); }
  updateDraft(id, data) { return this.execute((state) => {
    const draft = this.find(state, id);
    if (draft.folderId !== 'drafts') throw new EmailError('CONFLICT', 'This message is no longer a draft.');
    this.checkAttachments(state, data.attachments || []);
    Object.assign(draft, data, { id, folderId: 'drafts', updatedAt: new Date().toISOString() }); return draft;
  }); }
  getAttachments(id) { return this.execute((state) => this.find(state, id).attachments); }
  async uploadAttachment(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new EmailError('UPLOAD', 'Could not read attachment.')); reader.readAsDataURL(file);
    });
    return this.execute((state) => {
      const attachment = { id: globalThis.crypto.randomUUID(), name: file.name, size: file.size, type: file.type, available: true };
      state.files[attachment.id] = { ...attachment, dataUrl }; return attachment;
    });
  }
  downloadAttachment(id) { return this.execute((state) => {
    const file = state.files[id];
    if (!file) throw new EmailError('NOT_FOUND', 'This sample attachment has no file content.');
    return file;
  }); }
  reset() {
    const task = this.queue.then(async () => {
      try { if (this.persistence) await this.persistence.reset(); else this.storage.removeItem(this.key); }
      catch (error) { if (this.persistence) throw error; throw new EmailError('STORAGE', 'Cannot reset mailbox storage.'); }
      this.failure = null; return { reset: true };
    });
    this.queue = task.catch(() => {}); return task;
  }
}
