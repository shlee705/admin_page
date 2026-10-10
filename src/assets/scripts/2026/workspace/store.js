/** Account-scoped snapshot adapter. Replace this adapter with resource APIs later. */
export class WorkspaceStore {
  constructor(client, user, kind, seed) {
    this.client = client; this.user = user; this.kind = kind; this.seed = seed;
    this.revision = 0; this.state = null; this.queue = Promise.resolve();
  }
  async load() {
    const result = await this.client.request(`/api/workspace/${this.kind}`);
    if (result.ownerId !== this.user.id) throw Error('Account ownership mismatch. Sign in again.');
    this.revision = result.revision;
    if (result.state) this.state = result.state;
    else await this.save({ version: 1, ownerId: this.user.id, ...this.seed() });
    return structuredClone(this.state);
  }
  async save(state) {
    const result = await this.client.request(`/api/workspace/${this.kind}`, { method: 'PUT', body: { expectedRevision: this.revision, state } });
    this.revision = result.revision; this.state = structuredClone(state);
  }
  mutate(change) {
    const operation = this.queue.then(async () => {
      if (!this.state) await this.load();
      const draft = structuredClone(this.state); const result = change(draft);
      await this.save(draft); return result;
    });
    this.queue = operation.catch(() => {}); return operation;
  }
  reset() { return this.mutate(state => { Object.keys(state).forEach(key => delete state[key]); Object.assign(state, { version: 1, ownerId: this.user.id, ...this.seed() }); }); }
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function exportJson(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
