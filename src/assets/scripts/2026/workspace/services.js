import { ResourceCalendar, LiveChat } from './resources.js';
import { WorkspaceStore } from './store.js';
export const CATEGORIES = ['personal', 'work', 'team', 'travel', 'finance', 'birthday', 'holiday'];
export function dateOnly(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function addDays(date, days) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
export function eventDate(value) { return new Date(value.length === 10 ? `${value}T00:00` : value); }
export function calendarSeed(now = new Date()) {
  const day = dateOnly(now); const tomorrow = dateOnly(addDays(now, 1));
  return { events: [
    { id: 'sample-meeting', title: 'Sample · planning meeting', description: 'Editable test fixture', start: `${day}T10:00`, end: `${day}T11:00`, allDay: false, category: 'work' },
    { id: 'sample-overlap', title: 'Sample · overlapping review', description: 'Tests overlapping time ranges', start: `${day}T10:30`, end: `${day}T11:30`, allDay: false, category: 'team' },
    { id: 'sample-day', title: 'Sample · all-day reminder', description: '', start: tomorrow, end: dateOnly(addDays(now, 2)), allDay: true, category: 'personal' },
    { id: 'sample-trip', title: 'Sample · multi-day workshop', description: 'End is exclusive', start: dateOnly(addDays(now, 2)), end: dateOnly(addDays(now, 5)), allDay: true, category: 'travel' },
    { id: 'sample-long', title: 'Sample · a long event title for testing wrapping and detailed event presentation on small screens', description: '', start: `${tomorrow}T14:00`, end: `${tomorrow}T15:00`, allDay: false, category: 'work' },
  ] };
}
export function validateEvent(data) {
  if (!data.title?.trim() || data.title.trim().length > 200) throw Error('Title must contain 1–200 characters.');
  if ((data.description || '').length > 4000) throw Error('Description must be at most 4000 characters.');
  const pattern = data.allDay ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  if (!pattern.test(data.start) || !pattern.test(data.end) || !Number.isFinite(Date.parse(data.start)) || !Number.isFinite(Date.parse(data.end)) || Date.parse(data.end) <= Date.parse(data.start)) throw Error('End must be after the start.');
  if (!CATEGORIES.includes(data.category)) throw Error('Choose a valid category.');
  return { ...data, title: data.title.trim(), description: data.description || '', allDay: Boolean(data.allDay) };
}
export class CalendarService {
  constructor(store) { this.store = store; }
  async list() { if (!this.store.state) await this.store.load(); return structuredClone(this.store.state.events); }
  save(data) { const event = validateEvent(data); return this.store.mutate(state => {
    const index = state.events.findIndex(item => item.id === event.id);
    if (event.id && index < 0) throw Error('Event no longer exists. Reload and retry.');
    const saved = { ...event, id: event.id || crypto.randomUUID() };
    if (index < 0) state.events.push(saved); else state.events[index] = saved;
    return saved;
  }); }
  remove(id) { return this.store.mutate(state => { state.events = state.events.filter(event => event.id !== id); }); }
  reset() { return this.store.reset(); }
}
export function chatSeed(user, now = new Date()) {
  return { rooms: ['Sample design room', 'Sample planning room', 'Private notes'].map((name, index) => ({ id: `room-${index + 1}`, name, participantIds: [user.id, ...(index < 2 ? [`fixture-${index}`] : [])], lastReadAt: index === 0 ? now.toISOString() : null, messages: index < 2 ? [{ id: `fixture-message-${index}`, roomId: `room-${index + 1}`, senderId: `fixture-${index}`, senderName: 'Sample participant', body: 'This is a test fixture. Messages you send are saved only to your account, not delivered to another user.', sentAt: now.toISOString(), delivery: 'fixture' }] : [] })) };
}
export class ChatService {
  constructor(store) { this.store = store; }
  async list() { if (!this.store.state) await this.store.load(); return structuredClone(this.store.state.rooms); }
  unread(room) { return room.messages.filter(message => message.senderId !== this.store.user.id && (!room.lastReadAt || message.sentAt > room.lastReadAt)).length; }
  read(id) { return this.store.mutate(state => { const room = state.rooms.find(item => item.id === id); if (!room) throw Error('Room not found.'); room.lastReadAt = new Date().toISOString(); }); }
  send(id, body) {
    if (!body.trim()) return Promise.reject(Error('Enter a message before sending.'));
    if (body.trim().length > 4000) return Promise.reject(Error('Message must be at most 4000 characters.'));
    return this.store.mutate(state => {
      const room = state.rooms.find(item => item.id === id); if (!room) throw Error('Room not found.');
      if (room.messages.length >= 500) throw Error('Room message limit reached (500).');
      const message = { id: crypto.randomUUID(), roomId: id, senderId: this.store.user.id, senderName: this.store.user.displayName, body: body.trim(), sentAt: new Date().toISOString(), delivery: 'mock-saved' };
      room.messages.push(message); room.lastReadAt = message.sentAt; return message;
    });
  }
  create(name) { if (!name.trim() || name.trim().length > 80) return Promise.reject(Error('Room name must contain 1–80 characters.')); return this.store.mutate(state => { const room = { id: crypto.randomUUID(), name: name.trim(), participantIds: [this.store.user.id], lastReadAt: null, messages: [] }; state.rooms.push(room); return room; }); }
  reset() { return this.store.reset(); }
}
export function workspaceServices(auth) {
  const calendar = new CalendarService(new WorkspaceStore(auth.client, auth.user, 'calendar', calendarSeed));
  const chat = new ChatService(new WorkspaceStore(auth.client, auth.user, 'chat', () => chatSeed(auth.user)));
  const tasks = new WorkspaceStore(auth.client, auth.user, 'tasks', () => ({ tasks: [] }));
  return { calendar: new ResourceCalendar(auth.client, calendar), chat, liveChat: new LiveChat(auth.client, auth.user), client: auth.client, tasks };
}
