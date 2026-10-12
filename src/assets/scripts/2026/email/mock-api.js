import { clone, countLabels, EmailError, FOLDERS, matchesFolder, normalizeEmail, queryEmails, SELF, validateLabels, visibleLabels } from './model.js';
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
    this.revisions = new Map();
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
      // Keep synchronous localStorage read/CAS/write in one turn across adapters.
      const operationResult = operation(state);
      const result = operationResult?.then ? await operationResult : operationResult;
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
  view(mail) { const result = normalizeEmail(mail); this.revisions.set(result.id, result.revision); return result; }
  checkRevision(draft, data) {
    const expected = data.expectedRevision ?? data.revision ?? this.revisions.get(draft.id);
    if (expected !== (draft.revision || 1)) throw new EmailError('CONFLICT', 'Draft changed in another editor. Your input is kept; reload the latest draft or keep your input as a new draft.');
  }
  preserveLegacyLabels(mail) {
    if (JSON.stringify(mail.labels) !== JSON.stringify(visibleLabels(mail.labels)) && mail.legacyLabels === undefined) mail.legacyLabels = clone(mail.labels ?? null);
  }
  getEmails(query = {}) { return this.execute((state) => queryEmails(state.emails.map(mail => this.view(mail)), query)); }
  searchEmails(query) { return this.getEmails(typeof query === 'string' ? { query } : query); }
  getEmailById(id) { return this.execute((state) => this.view(this.find(state, id))); }
  getThread(threadId) { return this.execute((state) => state.emails.filter((e) => e.threadId === threadId && !['trash', 'spam'].includes(e.folderId)).sort((a, b) => Date.parse(a.sentAt || a.receivedAt || a.updatedAt) - Date.parse(b.sentAt || b.receivedAt || b.updatedAt)).map(mail => this.view(mail))); }
  mutate(id, changes) { return this.execute((state) => {
    const mail = this.find(state, id); Object.assign(mail, typeof changes === 'function' ? changes(mail) : changes, { updatedAt: new Date().toISOString(), revision: (mail.revision || 1) + 1 }); return this.view(mail);
  }); }
  deleteEmail(id) { return this.moveEmail(id, 'trash'); }
  moveEmail(id, folderId) {
    if (!FOLDERS.includes(folderId) || ['starred', 'drafts', 'sent'].includes(folderId)) return Promise.reject(new EmailError('VALIDATION', 'Invalid destination folder.'));
    return this.execute((state) => {
      const mail = this.find(state, id);
      if (mail.folderId === 'drafts' && folderId !== 'trash') throw new EmailError('VALIDATION', 'Save or send the draft before moving it.');
      mail.folderId = folderId; mail.updatedAt = new Date().toISOString(); mail.revision = (mail.revision || 1) + 1; return this.view(mail);
    });
  }
  markAsRead(id) { return this.mutate(id, { isRead: true }); }
  markAsUnread(id) { return this.mutate(id, { isRead: false }); }
  toggleStar(id) { return this.mutate(id, (mail) => ({ isStarred: !mail.isStarred })); }
  async updateLabels(id, labels) {
    labels = validateLabels(labels);
    return this.mutate(id, mail => { this.preserveLegacyLabels(mail); return { labels }; });
  }
  getFolders() { return this.execute((state) => FOLDERS.map((id) => {
    const mails = state.emails.filter((e) => matchesFolder(e, id));
    return { id, name: id[0].toUpperCase() + id.slice(1), virtual: id === 'starred', total: mails.length, unread: mails.filter((e) => !e.isRead).length };
  })); }
  getLabels() { return this.execute((state) => countLabels(state.emails)); }
  createMessage(state, data, folderId) {
    const input = { ...data }; delete input.expectedRevision; delete input.revision;
    const id = globalThis.crypto.randomUUID();
    this.checkAttachments(state, data.attachments || []);
    const mail = normalizeEmail({ ...input, labels: validateLabels(data.labels), revision: 1, id, accountId: this.accountId, from: this.identity, folderId,
      threadId: data.threadId || id, messageId: folderId === 'sent' ? `<${id}@mock.adminator>` : null,
      isRead: true, deliveryStatus: folderId === 'sent' ? 'mock-sent' : 'draft',
      sentAt: folderId === 'sent' ? new Date().toISOString() : null, receivedAt: null });
    state.emails.push(mail); return this.view(mail);
  }
  checkAttachments(state, attachments) {
    for (const attachment of attachments) {
      if (attachment.available && !state.files[attachment.id]) throw new EmailError('NOT_FOUND', 'Attachment no longer available. Please upload it again.');
    }
  }
  sendEmail(data) { return this.execute((state) => {
    data = { ...data, labels: validateLabels(data.labels) };
    if (data.id) {
      const draft = this.find(state, data.id);
      if (draft.folderId !== 'drafts') throw new EmailError('CONFLICT', 'Only drafts can be sent again.');
      this.checkRevision(draft, data); this.preserveLegacyLabels(draft);
      this.checkAttachments(state, data.attachments || []);
      const input = { ...data }; delete input.expectedRevision; delete input.revision;
      Object.assign(draft, input, { revision: (draft.revision || 1) + 1, folderId: 'sent', from: this.identity, sentAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deliveryStatus: 'mock-sent', isRead: true, messageId: `<${draft.id}@mock.adminator>` });
      return { email: this.view(draft), status: 'mock-sent', requestId: globalThis.crypto.randomUUID() };
    }
    return { email: this.createMessage(state, data, 'sent'), status: 'mock-sent', requestId: globalThis.crypto.randomUUID() };
  }); }
  saveDraft(data) { return this.execute((state) => this.createMessage(state, data, 'drafts')); }
  updateDraft(id, data) { return this.execute((state) => {
    const draft = this.find(state, id);
    if (draft.folderId !== 'drafts') throw new EmailError('CONFLICT', 'This message is no longer a draft.');
    this.checkRevision(draft, data); this.preserveLegacyLabels(draft);
    this.checkAttachments(state, data.attachments || []);
    const input = { ...data }; delete input.expectedRevision; delete input.revision;
    Object.assign(draft, input, { labels: validateLabels(data.labels), revision: (draft.revision || 1) + 1, id, folderId: 'drafts', updatedAt: new Date().toISOString() }); return this.view(draft);
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
