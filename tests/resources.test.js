import { describe, it, expect } from 'vitest';
import { LiveChat, ResourceCalendar } from '../src/assets/scripts/2026/workspace/resources.js';

describe('real resource adapters', () => {
  it('uses one bounded calendar snapshot and retains every visible series for export', async () => {
    const calls = []; const series = [{id:'outside-view',revision:3}];
    const service = new ResourceCalendar({request:async path => {calls.push(path);return {series,events:[],upcoming:series};}});
    expect(await service.viewSnapshot('2030-01-01', '2030-02-01')).toEqual({series,events:[],upcoming:series});
    expect(calls).toHaveLength(1); expect(calls[0]).toContain('expand=true&start=2030-01-01&end=2030-02-01');
    expect(service.events).toEqual(series);
  });
  it('loads recent messages, fetches only new sequences, and keeps older history accessible to deep links', async () => {
    const calls = [];
    const client = {request:async path => {
      calls.push(path);
      if (path.includes('latest=true')) return {messages:[{id:'recent',sequence:101}],nextAfter:101,hasMore:false,hasOlder:true,oldestSequence:101};
      if (path.includes('before=101')) return {messages:[{id:'target',sequence:1}],hasOlder:false,oldestSequence:1};
      return {messages:[{id:'new',sequence:102}],nextAfter:102,hasMore:false};
    }};
    const service = new LiveChat(client,{id:'alice'});
    expect((await service.history('room')).map(m=>m.id)).toEqual(['recent']);
    expect(service.hasOlder('room')).toBe(true);
    expect((await service.history('room')).map(m=>m.id)).toEqual(['recent','new']);
    expect(calls[1]).toContain('after=101&');
    expect(await service.ensureMessage('room','target')).toBe(true);
    expect(service.hasOlder('room')).toBe(false);
    expect(service.messages.get('room').map(m=>m.sequence)).toEqual([1,101,102]);
    expect(calls.filter(path=>path.includes('latest=true'))).toHaveLength(1);
  });
  it('retains the send ID when delivery succeeds but history refresh fails', async () => {
    const sent = []; let failed = false;
    const client = { request: async (_path, options) => {
      if (options?.method === 'POST') { sent.push(options.body.clientId); return { id: 'stored' }; }
      if (!failed) { failed = true; throw Error('history offline'); }
      return { messages: [], nextAfter: 0, hasMore: false };
    } };
    const service = new LiveChat(client, { id: 'alice' });
    await expect(service.send('room', 'delivered')).rejects.toThrow('history offline');
    await service.send('room', 'delivered');
    expect(sent[1]).toBe(sent[0]);
  });
  it('retries a lost chat acknowledgement with the same client ID', async () => {
    const sent = []; let fail = true;
    const client = { request: async (path, options) => { if(options?.method === 'POST') { sent.push(options.body); if(fail) { fail = false; throw Error('ack lost'); } return {id:'server-id'}; } return {messages:[],nextAfter:0,hasMore:false}; } };
    const service = new LiveChat(client,{id:'alice'});
    await expect(service.send('room','hello')).rejects.toThrow('ack lost');
    await service.send('room','hello');
    expect(sent[1].clientId).toBe(sent[0].clientId);
    await service.send('room','next'); expect(sent[2].clientId).not.toBe(sent[0].clientId);
  });
  it('loads all history pages using server cursors and marks only the loaded last sequence', async () => {
    const reads = []; const client = { request: async(path, options) => { if(options) { reads.push(options.body); return {}; } return path.includes('after=0&') ? {messages:[{sequence:1}],nextAfter:1,hasMore:true} : {messages:[{sequence:8}],nextAfter:8,hasMore:false}; } };
    const service = new LiveChat(client,{id:'alice'}); await service.read('room'); expect(reads).toEqual([{sequence:8}]);
  });
  it('preserves legacy private snapshots without automatic import or writes', async () => {
    const calls = []; const legacy = {list:async()=>[],reset:async()=>{}};
    const client = { request:async(path,options)=>{ calls.push({path,options}); return path === '/api/calendar/events' ? {events:[{id:'event',revision:2}]} : {}; } };
    const service = new ResourceCalendar(client,legacy); await service.list(); await service.list();
    expect(calls.filter(c=>c.path === '/api/calendar/import')).toHaveLength(0);
    await service.save({id:'event',title:'Title',description:'',start:'2026-10-09T09:00',end:'2026-10-09T10:00',allDay:false,category:'work'});
    expect(calls.at(-1).options.body.expectedRevision).toBe(2);
    expect(calls.at(-1).options.body.timezone).toBeTruthy();
    expect(calls.some(c=>c.path.startsWith('/api/workspace'))).toBe(false);
  });
});
