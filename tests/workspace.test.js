import { describe, it, expect } from 'vitest';
import { WorkspaceStore } from '../src/assets/scripts/2026/workspace/store.js';
import { CalendarService, ChatService, calendarSeed, chatSeed, validateEvent, eventDate } from '../src/assets/scripts/2026/workspace/services.js';

const user = { id: 'alice-id', displayName: 'Alice' };
function fixture(kind, seed) {
  let saved = null; let revision = 0; let fail = false;
  const client = { request: async (_path, options) => {
    if (!options) return { ownerId: user.id, revision, state: saved };
    if (fail) throw Error('Save failed');
    if (options.body.expectedRevision !== revision) throw Error('Data changed');
    saved = structuredClone(options.body.state); revision++; return { revision };
  } };
  return { store: new WorkspaceStore(client, user, kind, seed), client, fail: () => { fail = true; }, saved: () => saved };
}
describe('Account workspace services', () => {
  it('interprets all-day boundaries at local midnight, not UTC', () => { expect(eventDate('2031-06-18').getHours()).toBe(0); expect(eventDate('2031-06-18T10:30').getHours()).toBe(10); });
  it('does not expose seeds when initial persistence fails', async () => { const state = fixture('calendar', calendarSeed); state.fail(); await expect(state.store.load()).rejects.toThrow('Save failed'); expect(state.store.state).toBe(null); });
  it('seeds all requested relative calendar cases without fixed dates', () => {
    const events = calendarSeed(new Date(2031, 5, 18)).events;
    expect(events).toHaveLength(5); expect(events.every(event => event.start.startsWith('2031-06'))).toBe(true);
    expect(events.filter(event => event.allDay)).toHaveLength(2); expect(events[0].end > events[1].start).toBe(true); expect(events.at(-1).title.length).toBeGreaterThan(70);
  });
  it.each([{ title: '' }, { title: ' '.repeat(3) }, { end: '2031-06-18T08:00' }, { category: 'bad' }, { start: '' }, { description: 'x'.repeat(4001) }])('rejects invalid events %j', change => {
    expect(() => validateEvent({ ...calendarSeed(new Date(2031, 5, 18)).events[0], ...change })).toThrow();
  });
  it('persists create, edit, delete and reset with stable IDs', async () => {
    const { store, saved } = fixture('calendar', calendarSeed); const service = new CalendarService(store); await service.list();
    const template = (await service.list())[0]; delete template.id;
    const created = await service.save({ ...template, title: 'New' }); expect(saved().events).toHaveLength(6);
    await service.save({ ...created, title: 'Edited' }); expect((await service.list()).find(event => event.id === created.id).title).toBe('Edited');
    await service.remove(created.id); expect(saved().events).toHaveLength(5); await service.reset(); expect(saved().events).toHaveLength(5);
  });
  it('does not commit state when persistence fails', async () => {
    const fixtureState = fixture('calendar', calendarSeed); await fixtureState.store.load(); fixtureState.fail();
    const service = new CalendarService(fixtureState.store); await expect(service.remove('sample-meeting')).rejects.toThrow('Save failed'); expect((await service.list())).toHaveLength(5);
  });
  it('serializes simultaneous changes without losing messages', async () => {
    const { store } = fixture('chat', () => chatSeed(user)); const service = new ChatService(store); await service.list(); await Promise.all([service.send('room-3', 'First'), service.send('room-3', 'Second')]);
    const room = (await service.list())[2]; expect(room.messages.map(message => message.body)).toEqual(['First', 'Second']); expect(room.messages.every(message => message.senderId === user.id && message.delivery === 'mock-saved')).toBe(true);
  });
  it('prevents blank/oversized messages and invalid rooms', async () => {
    const { store } = fixture('chat', () => chatSeed(user)); const service = new ChatService(store);
    await expect(service.send('room-3', '\n  ')).rejects.toThrow(); await expect(service.send('room-3', 'x'.repeat(4001))).rejects.toThrow(); await expect(service.send('unknown', 'Hello')).rejects.toThrow('Room not found');
  });
  it('tracks unread sample messages per room and persists reading', async () => {
    const { store } = fixture('chat', () => chatSeed(user)); const service = new ChatService(store); const rooms = await service.list(); expect(service.unread(rooms[1])).toBe(1); await service.read(rooms[1].id); expect(service.unread((await service.list())[1])).toBe(0);
  });
  it('creates private account-only rooms', async () => {
    const { store } = fixture('chat', () => chatSeed(user)); const service = new ChatService(store); const room = await service.create('My notes'); expect(room.participantIds).toEqual([user.id]); expect(room.messages).toEqual([]); await expect(service.create('  ')).rejects.toThrow();
  });
  it('rejects ownership mismatch instead of accepting another account state', async () => {
    const store = new WorkspaceStore({ request: async () => ({ ownerId: 'bob', state: {} }) }, user, 'chat', () => chatSeed(user)); await expect(store.load()).rejects.toThrow('ownership');
  });
  it('does not overwrite a stale snapshot from another browser', async () => {
    const { store, client } = fixture('calendar', calendarSeed); await store.load(); const other = new WorkspaceStore(client, user, 'calendar', calendarSeed); await other.load(); await store.mutate(state => { state.events = []; }); await expect(other.mutate(state => { state.events = []; })).rejects.toThrow('Data changed'); expect(other.state.events).toHaveLength(5);
  });
});
