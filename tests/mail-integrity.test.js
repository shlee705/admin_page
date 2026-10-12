import { describe, expect, it, vi } from 'vitest';
import { createEmailService, EmailService } from '../src/assets/scripts/2026/email/service.js';
import { InternalEmailApi } from '../src/assets/scripts/2026/email/internal-api.js';
import { MockEmailApi } from '../src/assets/scripts/2026/email/mock-api.js';
import { initEmailPage } from '../src/assets/scripts/2026/email/ui.js';

const message = { to: 'alice@example.com', subject: 'Original', bodyText: 'Original body' };
const create = () => createEmailService({ latency: 0 });

describe('Mail integrity remediation', () => {
  it('retains observed revisions through the service and rejects stale mock draft saves', async () => {
    const service = create(); const draft = await service.saveDraft(message);
    expect(draft.revision).toBe(1);
    const latest = await service.saveDraft({ ...draft, bodyText: 'Latest' });
    expect(latest.revision).toBe(2);
    await expect(service.saveDraft({ ...draft, bodyText: 'Stale' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await service.getEmailById(draft.id)).bodyText).toBe('Latest');
    const result = await service.sendEmail({ ...latest, to: message.to });
    expect(result.email.folderId).toBe('sent');
  });
  it('forwards explicit observed revisions to the internal API', async () => {
    const request = vi.fn().mockResolvedValue({id:'draft-1',revision:2});
    const service = new EmailService(new InternalEmailApi({authClient:{request}}));
    await service.saveDraft({ ...message, id:'draft-1', revision:1 });
    expect(request.mock.calls[0][1].body.expectedRevision).toBe(1);
  });
  it('keeps the same send payload and request ID after a lost response and later reads', async () => {
    let attempt = 0;
    const request = vi.fn(async (path, options) => {
      if (path.endsWith('/emails/draft-1')) return {id:'draft-1',revision: attempt ? 2 : 1};
      if (options?.method === 'POST') {
        if (!attempt++) throw Error('Response lost');
        return {email:{id:'draft-1',revision:2},status:'delivered-internal'};
      }
    });
    const api = new InternalEmailApi({authClient:{request}});
    await api.getEmailById('draft-1');
    const body = {...message,id:'draft-1'};
    await expect(api.sendEmail(body)).rejects.toThrow('Response lost');
    await api.getEmailById('draft-1'); await api.sendEmail(body);
    const sends=request.mock.calls.filter(([,options])=>options?.method==='POST');
    expect(sends[0][1].body).toEqual(sends[1][1].body);
    expect(sends[1][1].body.expectedRevision).toBe(1);
  });
  it('serializes local mock CAS across different adapter instances', async () => {
    const a=create(); const b=create(); const draft=await a.saveDraft(message);
    await b.getEmailById(draft.id);
    const results=await Promise.allSettled([a.saveDraft({...draft,bodyText:'First'}),b.saveDraft({...draft,bodyText:'Second'})]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(result=>result.status==='rejected')[0].reason.code).toBe('CONFLICT');
    expect((await a.getEmailById(draft.id)).revision).toBe(2);
  });
  it.each([['Unsupported'], [null], [5], 'Work', {Work:true}, ['W'.repeat(81)], Array(6).fill('Work')].map(labels=>[labels]))('validates label shape and supported fixed values for all adapters (%j)', async labels => {
    const service = create();
    await expect(service.saveDraft({...message,labels})).rejects.toMatchObject({code:'VALIDATION'});
    await expect(service.sendEmail({...message,labels})).rejects.toMatchObject({code:'VALIDATION'});
    await expect(service.updateLabels('sample-1',labels)).rejects.toMatchObject({code:'VALIDATION'});
  });
  it('deduplicates valid labels and safely reads legacy data without erasing stored labels', async () => {
    const api = new MockEmailApi({latency:0});
    const draft = await api.saveDraft({...message, labels:['Work','Work','Team']});
    expect(draft.labels).toEqual(['Work','Team']);
    const raw=JSON.parse(localStorage.getItem(api.key));
    raw.emails.find(m=>m.id===draft.id).labels=['Work','unmanaged',null,'Work'];
    localStorage.setItem(api.key,JSON.stringify(raw));
    expect((await api.getEmailById(draft.id)).labels).toEqual(['Work']);
    await api.markAsUnread(draft.id);
    expect(JSON.parse(localStorage.getItem(api.key)).emails.find(m=>m.id===draft.id).labels).toEqual(['Work','unmanaged',null,'Work']);
  });
  it('keeps conflict input and offers explicit reload and save-as-new recovery', async () => {
    document.body.dataset.active='compose'; document.body.innerHTML='<main data-email-app></main>';
    const service=create(); await initEmailPage({service});
    document.querySelector('[name=subject]').value='Original'; document.querySelector('[name=bodyText]').value='Original body';
    document.querySelector('[data-action=save-draft]').click();
    await vi.waitFor(()=>expect(document.querySelector('[data-status]').textContent).toBe('Draft saved'));
    const draft=(await service.getEmails({folderId:'drafts',query:'Original body'})).items[0];
    await service.saveDraft({...draft,subject:'Latest server',bodyText:'Latest server body'});
    document.querySelector('[name=subject]').value='My input'; document.querySelector('[name=bodyText]').value='Keep my input';
    document.querySelector('[data-action=save-draft]').click();
    await vi.waitFor(()=>expect(document.querySelector('[data-compose-error]').textContent).toMatch(/changed|another|conflict/i));
    expect(document.querySelector('[name=bodyText]').value).toBe('Keep my input');
    expect(document.querySelector('[data-action=reload-draft]').hidden).toBe(false);
    document.querySelector('[data-action=keep-draft-input]').click();
    document.querySelector('[data-action=save-draft]').click();
    await vi.waitFor(()=>expect(document.querySelector('[data-status]').textContent).toBe('Draft saved'));
    expect((await service.getEmails({folderId:'drafts',query:'Keep my input'})).total).toBe(1);
    expect((await service.getEmailById(draft.id)).bodyText).toBe('Latest server body');
  });
  it('reloads the latest draft only after the explicit recovery action', async () => {
    document.body.dataset.active='compose';document.body.innerHTML='<main data-email-app></main>';
    const service=create();await initEmailPage({service});
    document.querySelector('[name=subject]').value='Original';document.querySelector('[name=bodyText]').value='Original body';
    document.querySelector('[data-action=save-draft]').click();
    await vi.waitFor(()=>expect(document.querySelector('[data-status]').textContent).toBe('Draft saved'));
    const draft=(await service.getEmails({folderId:'drafts',query:'Original body'})).items[0];
    await service.saveDraft({...draft,bodyText:'Latest saved elsewhere'});
    document.querySelector('[name=bodyText]').value='Local unsaved text';document.querySelector('[data-action=save-draft]').click();
    await vi.waitFor(()=>expect(document.querySelector('[data-compose-error]').textContent).toMatch(/changed/));
    expect(document.querySelector('[name=bodyText]').value).toBe('Local unsaved text');
    document.querySelector('[data-action=reload-draft]').click();
    await vi.waitFor(()=>expect(document.querySelector('[data-status]').textContent).toBe('Latest draft loaded'));
    expect(document.querySelector('[name=bodyText]').value).toBe('Latest saved elsewhere');
    document.querySelector('[data-action=save-draft]').click();
    await vi.waitFor(()=>expect(document.querySelector('[data-status]').textContent).toBe('Draft saved'));
    expect((await service.getEmailById(draft.id)).revision).toBe(3);
  });
  it('reconciles recovered mailAutoRefresh preferences without resetting compose input', async () => {
    document.body.dataset.active='email';document.body.innerHTML='<main data-email-app></main>';
    let listener;const unsubscribe=vi.fn();
    const preferences={state:{mailAutoRefresh:false},subscribe:fn=>{listener=fn;return unsubscribe;}};
    const start=vi.spyOn(globalThis,'setInterval').mockReturnValue(123);
    const stop=vi.spyOn(globalThis,'clearInterval');
    await initEmailPage({service:create(),config:{mode:'internal',hub:{preferences}}});
    document.querySelector('[name=bodyText]').value='Unsaved input';
    expect(start).not.toHaveBeenCalled();
    preferences.state.mailAutoRefresh=true;listener({recovered:true});
    expect(start).toHaveBeenCalledWith(expect.any(Function),30000);
    expect(document.querySelector('[name=bodyText]').value).toBe('Unsaved input');
    preferences.state.mailAutoRefresh=false;listener({source:'save'});
    expect(stop).toHaveBeenCalledWith(123);
    window.dispatchEvent(new Event('adminator-account-changing'));
    expect(unsubscribe).toHaveBeenCalled();
  });
});
