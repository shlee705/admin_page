import { describe, it, expect, vi } from 'vitest';
import { InternalEmailApi } from '../src/assets/scripts/2026/email/internal-api.js';
import { MockEmailApi } from '../src/assets/scripts/2026/email/mock-api.js';
import { EmailService } from '../src/assets/scripts/2026/email/service.js';
import { initEmailPage } from '../src/assets/scripts/2026/email/ui.js';
import { countLabels } from '../src/assets/scripts/2026/email/model.js';

const ready = () => vi.waitFor(() => expect(document.querySelector('[data-email-app]').getAttribute('aria-busy')).toBe('false'));
const click = async selector => { document.querySelector(selector).click(); await ready(); };
const rows = () => [...document.querySelectorAll('[data-email-id]')].map(el => el.dataset.emailId).sort();
const mount = async () => {
  document.body.dataset.active = 'email'; document.body.innerHTML = '<main data-email-app></main>';
  const service = new EmailService(new MockEmailApi({latency:0}));
  await initEmailPage({service}); return service;
};
describe('Label totals and mailbox filters', () => {
  it('counts all physical folders once, preserves zero, and uses owner-scoped API data', async () => {
    const mails = [{labels:['Work','Work'],folderId:'trash'}, {labels:['Work'],folderId:'spam'}, {labels:[],folderId:'inbox'}];
    const api = new InternalEmailApi({authClient:{request:vi.fn().mockResolvedValue({items:mails})}});
    expect(await api.getLabels()).toEqual(countLabels(mails));
    expect((await api.getLabels()).find(l => l.id === 'Work').total).toBe(2);
    expect((await api.getLabels()).find(l => l.id === 'Finance').total).toBe(0);
    api.client.request.mockRejectedValue(new Error('offline'));
    await expect(api.getLabels()).rejects.toThrow('offline');
  });
  it('toggles and replaces one label, clears on every folder change, and displays actual rows', async () => {
    const service = await mount();
    const assertView = async (folderId, label = '') => {
      expect(rows()).toEqual((await service.searchEmails({folderId,label})).items.map(m=>m.id).sort());
      expect(document.querySelector(`[data-folder="${folderId}"]`).getAttribute('aria-pressed')).toBe('true');
      expect(document.querySelector('[data-filter="label"]').value).toBe(label);
    };
    await click('[data-label="Work"]'); await assertView('inbox','Work');
    expect(document.querySelector('[data-label="Work"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-list-title]').textContent).toContain('Inbox');
    await click('[data-label="Work"]'); await assertView('inbox');
    await click('[data-label="Work"]'); await click('[data-label="Team"]'); await assertView('inbox','Team');
    await click('[data-action="clear-label"]'); await assertView('inbox');
    for (const folder of ['sent','drafts','trash','spam','archive','starred','snoozed','inbox']) {
      await click('[data-label="Work"]'); await click(`[data-folder="${folder}"]`); await assertView(folder);
    }
    await click('[data-folder="sent"]'); await click('[data-label="Finance"]'); await assertView('sent','Finance');
    await click('[data-folder="inbox"]'); await assertView('inbox');
    await click('[data-label="Invoices"]'); await assertView('inbox','Invoices');
    if (!rows().length) expect(document.querySelector('[data-testid="empty-mailbox"]')).not.toBeNull();
  });
  it('updates totals after label edits and retains totals across trash and restore', async () => {
    const service = await mount();
    const total = async () => (await service.getLabels()).find(l=>l.id === 'Travel').total;
    const before = await total();
    await service.updateLabels('sample-1',['Travel']);
    await click('[data-action="refresh"]');
    expect(document.querySelector('[data-label="Travel"] .mail-folder-count').textContent).toBe(String(before+1));
    await service.deleteEmail('sample-1'); expect(await total()).toBe(before+1);
    await service.moveEmail('sample-1','inbox'); expect(await total()).toBe(before+1);
    await service.updateLabels('sample-1',[]); await click('[data-action="refresh"]'); expect(await total()).toBe(before);
    const other = new EmailService(new MockEmailApi({accountId:'other',latency:0}));
    expect((await other.getEmailById('sample-1')).labels).not.toEqual([]);
  });
  it('distinguishes unavailable counts, rolls back failed filters, and clears data on account change', async () => {
    const service = await mount(); const initial = rows();
    vi.spyOn(service,'getLabels').mockRejectedValue(new Error('offline'));
    await click('[data-action="refresh"]');
    expect(document.querySelector('[data-label="Work"] .mail-folder-count').textContent).toBe('—');
    expect(document.querySelector('[data-error]').textContent).toContain('unavailable');
    vi.spyOn(service,'searchEmails').mockRejectedValue(new Error('list offline'));
    await click('[data-label="Work"]'); expect(rows()).toEqual(initial);
    expect(document.querySelector('[data-filter="label"]').value).toBe('');
    expect(document.querySelector('[data-label="Work"]').getAttribute('aria-pressed')).toBe('false');
    window.dispatchEvent(new Event('adminator-account-changing'));
    expect(document.querySelector('[data-email-app]').textContent).toBe('');
  });
  it('ignores a late response from the previous account', async () => {
    const service = await mount();
    const page = await service.searchEmails({folderId:'inbox'});
    let resolve;
    vi.spyOn(service,'searchEmails').mockImplementation(() => new Promise(done => {resolve=done;}));
    document.querySelector('[data-action="refresh"]').click();
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    window.dispatchEvent(new Event('adminator-account-changing'));
    resolve(page);
    await new Promise(done => setTimeout(done,10));
    expect(document.querySelector('[data-email-app]').textContent).toBe('');
  });

});
