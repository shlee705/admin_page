import { InternalEmailApi } from './internal-api.js';
import { ATTACHMENT_TYPES, EmailError, MAX_ATTACHMENT_SIZE, parseAddresses, SELF, validateMessage } from './model.js';
import { MockEmailApi } from './mock-api.js';
import { RestEmailApi } from './rest-api.js';

/**
 * @typedef {Object} EmailApi
 * @property {function(Object=): Promise<Object>} getEmails
 * @property {function(Object|string): Promise<Object>} searchEmails
 * @property {function(string): Promise<Object>} getEmailById
 * @property {function(string): Promise<Object[]>} getThread
 * @property {function(Object): Promise<Object>} sendEmail
 * @property {function(Object): Promise<Object>} saveDraft
 * @property {function(string,Object): Promise<Object>} updateDraft
 * @property {function(string): Promise<Object>} deleteEmail
 * @property {function(string,string): Promise<Object>} moveEmail
 * @property {function(string): Promise<Object>} markAsRead
 * @property {function(string): Promise<Object>} markAsUnread
 * @property {function(string): Promise<Object>} toggleStar
 * @property {function(): Promise<Object[]>} getFolders
 * @property {function(): Promise<Object[]>} getLabels
 * @property {function(string,string[]): Promise<Object>} updateLabels
 * @property {function(string): Promise<Object[]>} getAttachments
 * @property {function(File): Promise<Object>} uploadAttachment
 * @property {function(string): Promise<Object>} downloadAttachment
 */

/** All mailbox operations pass through this layer; UI has no persistence access. */
export class EmailService {
  /** @param {EmailApi} api */
  constructor(api, { identity = SELF } = {}) { this.api = api; this.identity = identity; }
  getEmails(query) { return this.api.getEmails(query); }
  searchEmails(query) { return this.api.searchEmails(query); }
  getEmailById(id) { return this.api.getEmailById(id); }
  getThread(id) { return this.api.getThread(id); }
  getFolders() { return this.api.getFolders(); }
  getLabels() { return this.api.getLabels(); }
  deleteEmail(id) { return this.api.deleteEmail(id); }
  moveEmail(id, folder) { return this.api.moveEmail(id, folder); }
  markAsRead(id) { return this.api.markAsRead(id); }
  markAsUnread(id) { return this.api.markAsUnread(id); }
  toggleStar(id) { return this.api.toggleStar(id); }
  updateLabels(id, labels) { return this.api.updateLabels(id, labels); }
  getAttachments(id) { return this.api.getAttachments(id); }
  downloadAttachment(id) { return this.api.downloadAttachment(id); }
  message(input) {
    const data = {};
    for (const key of ['id', 'threadId', 'inReplyTo', 'references', 'attachments', 'category', 'labels']) {
      if (input[key] !== undefined) data[key] = input[key];
    }
    for (const key of ['to', 'cc', 'bcc']) data[key] = Array.isArray(input[key]) ? input[key] : parseAddresses(input[key]);
    data.subject = String(input.subject || ''); data.bodyText = String(input.bodyText || ''); data.bodyHtml = '';
    return data;
  }
  async sendEmail(input) { const data = this.message(input); validateMessage(data, true); return this.api.sendEmail(data); }
  async saveDraft(input) { const data = this.message(input); validateMessage(data); return data.id ? this.api.updateDraft(data.id, data) : this.api.saveDraft(data); }
  async updateDraft(id, input) { return this.saveDraft({ ...input, id }); }
  async uploadAttachment(file) {
    if (!file.size || file.size > MAX_ATTACHMENT_SIZE) throw new EmailError('VALIDATION', 'Attachment must be between 1 byte and 2 MB.');
    if (!ATTACHMENT_TYPES.includes(file.type)) throw new EmailError('VALIDATION', 'Supported attachments: TXT, CSV, PDF, PNG, JPEG, GIF.');
    return this.api.uploadAttachment(file);
  }
  async composeFrom(id, mode) {
    const email = await this.getEmailById(id);
    if (mode === 'draft') return email;
    const forward = mode === 'forward';
    const ownAddress = this.identity.address.toLowerCase();
    const dedupe = (people) => [...new Map(people.filter((p) => p.address.toLowerCase() !== ownAddress).map((p) => [p.address.toLowerCase(), p])).values()];
    const to = forward ? [] : dedupe(email.from.address.toLowerCase() === ownAddress ? email.to : [email.from]);
    const cc = mode === 'reply-all' ? dedupe([...email.to, ...email.cc]).filter((p) => !to.some((t) => t.address.toLowerCase() === p.address.toLowerCase())) : [];
    return {
      to, cc, bcc: [], subject: `${forward ? 'Fwd' : 'Re'}: ${email.subject.replace(/^(Re|Fwd):\s*/i, '')}`,
      bodyText: `\n\n${forward ? 'Forwarded message' : 'Original message'} from ${email.from.address}:\n${email.bodyText}`,
      threadId: forward ? undefined : email.threadId,
      inReplyTo: forward ? null : email.messageId,
      references: forward ? [] : [...new Set([...email.references, email.messageId].filter(Boolean))],
      attachments: forward ? await this.getAttachments(id) : [],
    };
  }
  reset() {
    if (!this.api.reset) return Promise.reject(new EmailError('CONFIG', 'Reset is only available in mock mode.'));
    return this.api.reset();
  }
  failNext() {
    if (!this.api.failNext) throw new EmailError('CONFIG', 'Failure simulation is only available in mock mode.');
    this.api.failNext();
  }
}

/** Configuration is optional; unset always means mock, with no fetch calls. */
export function createEmailService(config = {}) {
  const mode = config.mode || 'mock';
  if (!['mock', 'rest', 'internal'].includes(mode)) throw new EmailError('CONFIG', 'Unknown email API mode.');
  return new EmailService(mode === 'internal' ? new InternalEmailApi(config) : mode === 'rest' ? new RestEmailApi(config) : new MockEmailApi(config), config);
}
