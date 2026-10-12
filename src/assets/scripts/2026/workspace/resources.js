import { validateEvent } from './services.js';

export class ResourceCalendar {
  constructor(client, legacy) { this.client = client; this.legacy = legacy; this.ready = false; this.events = []; this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'; }
  async list() {
    this.events = (await this.client.request('/api/calendar/events')).events;
    return this.events;
  }
  async occurrences() { return (await this.client.request('/api/calendar/events?expand=true')).events; }
  async viewSnapshot(start, end) {
    const result = await this.client.request(`/api/calendar/events?${new URLSearchParams({ expand: 'true', start, end })}`);
    this.events = result.series;
    return result;
  }
  save(data) {
    const valid = validateEvent(data);
    const keys = ['title','description','start','end','allDay','category','timezone','recurrence','location','attendeeIds'];
    const body = Object.fromEntries(keys.filter(key => valid[key] !== undefined).map(key => [key, valid[key]]));
    body.timezone ||= this.timezone;
    const old = this.events.find(event => event.id === data.id);
    if (data.id) body.expectedRevision = data.revision ?? old?.revision;
    else body.clientId = data.clientId || crypto.randomUUID();
    return this.client.request(`/api/calendar/events${data.id ? `/${encodeURIComponent(data.id)}` : ''}`, { method: data.id ? 'PATCH' : 'POST', body });
  }
  remove(id) { const old = this.events.find(event => event.id === id); return this.client.request(`/api/calendar/events/${encodeURIComponent(id)}?revision=${old?.revision}`, { method: 'DELETE' }); }
  async reset() { await this.legacy.reset(); await this.client.request('/api/calendar/import', { method: 'POST', body: { timezone: this.timezone } }); return this.client.request('/api/calendar/samples/reset', { method: 'POST' }); }
  searchUsers(q) { return this.client.request(`/api/users/search?q=${encodeURIComponent(q)}`); }
  respond(id, status) { return this.client.request(`/api/calendar/events/${encodeURIComponent(id)}/response`, { method: 'POST', body: { status } }); }
}

export class LiveChat {
  constructor(client, user) { this.client = client; this.store = { user }; this.rooms = []; this.messages = new Map(); this.pages = new Map(); this.loading = new Map(); this.pending = null; this.closed = false; this.onchange = () => {}; this.onstatus = () => {}; this.retry = 1000; }
  async list() {
    this.rooms = (await this.client.request('/api/chat/rooms')).rooms;
    for (const room of this.rooms) if (this.messages.has(room.id)) room.messages = this.messages.get(room.id);
    return this.rooms;
  }
  unread(room) { return room.unread; }
  async history(id) {
    if (this.loading.has(id)) return this.loading.get(id);
    const load = this.loadHistory(id);
    this.loading.set(id, load);
    try { return await load; } finally { this.loading.delete(id); }
  }
  async loadHistory(id) {
    const initial = !this.messages.has(id);
    const messages = [...(this.messages.get(id) || [])]; let after = messages.at(-1)?.sequence || 0; let more = true;
    while (more) {
      const result = await this.client.request(`/api/chat/rooms/${encodeURIComponent(id)}/messages?after=${after}&limit=100${initial && after === 0 ? '&latest=true' : ''}`);
      messages.push(...result.messages); after = result.nextAfter; more = result.hasMore;
      if (initial && typeof result.hasOlder === 'boolean') {
        this.pages.set(id, { hasOlder: result.hasOlder, oldestSequence: result.oldestSequence });
        break;
      }
      if (!result.messages.length) break;
    }
    const unique = [...new Map(messages.map(message => [message.sequence, message])).values()].sort((a,b) => a.sequence - b.sequence);
    this.messages.set(id, unique); return unique;
  }
  hasOlder(id) { return this.pages.get(id)?.hasOlder || false; }
  async older(id) {
    await this.history(id);
    const page = this.pages.get(id); if (!page?.hasOlder) return this.messages.get(id);
    const result = await this.client.request(`/api/chat/rooms/${encodeURIComponent(id)}/messages?before=${page.oldestSequence}&limit=100`);
    const messages = [...new Map([...result.messages, ...this.messages.get(id)].map(message => [message.sequence, message])).values()].sort((a,b) => a.sequence - b.sequence);
    this.messages.set(id, messages);
    this.pages.set(id, { hasOlder: result.hasOlder && result.messages.length > 0, oldestSequence: result.oldestSequence });
    return messages;
  }
  async ensureMessage(id, messageId) {
    await this.history(id);
    while (!this.messages.get(id).some(message => message.id === messageId) && this.hasOlder(id)) await this.older(id);
    return this.messages.get(id).some(message => message.id === messageId);
  }
  async read(id) { const messages = await this.history(id); return this.client.request(`/api/chat/rooms/${encodeURIComponent(id)}/read`, { method: 'POST', body: { sequence: messages.at(-1)?.sequence || 0 } }); }
  async send(id, body) {
    // Retain the same retry ID after a network failure or lost acknowledgement.
    if (!this.pending || this.pending.id !== id || this.pending.body !== body) this.pending = { id, body, clientId: crypto.randomUUID() };
    const message = await this.client.request(`/api/chat/rooms/${encodeURIComponent(id)}/messages`, { method: 'POST', body: { body, clientId: this.pending.clientId } });
    await this.history(id); this.pending = null; return message;
  }
  searchUsers(q) { return this.client.request(`/api/users/search?q=${encodeURIComponent(q)}`); }
  createShared(name) { return this.client.request('/api/chat/rooms', { method: 'POST', body: { name } }); }
  create(userId) { return this.client.request('/api/chat/rooms', { method: 'POST', body: { userId } }); }
  connect() {
    this.closed = false;
    const url = new URL('/api/chat/ws', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(url);
    this.socket.onopen = () => { this.retry = 1000; this.onstatus('Connected · Live account messaging'); this.onchange(); };
    this.socket.onmessage = event => { const payload = JSON.parse(event.data); if (payload.type !== 'heartbeat') this.onchange(payload); };
    this.socket.onerror = () => this.onstatus('Connection interrupted · Messages remain in the database');
    this.socket.onclose = event => { if (!this.closed && event.code !== 1008) { this.onstatus('Reconnecting · You can still send and reload history'); this.timer = setTimeout(() => this.connect(), this.retry); this.retry = Math.min(this.retry * 2, 30000); } else if (event.code === 1008) this.onstatus('Session ended. Sign in again.'); };
  }
  stop() { this.closed = true; clearTimeout(this.timer); this.socket?.close(); }
}
