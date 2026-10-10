import { describe, it, expect } from 'vitest';
import { LiveChat, ResourceCalendar } from '../src/assets/scripts/2026/workspace/resources.js';

describe('real resource adapters', () => {
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
