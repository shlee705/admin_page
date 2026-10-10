/** Authenticated fixture state storage; the backend derives ownership from its session. */
export function accountEmailConfig(user, client, config = {}) {
  let revision = 0;
  const namespace = config.namespace || 'default';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(namespace)) throw Error('Invalid mock mailbox namespace.');
  const path = `/api/mock-mailbox?namespace=${encodeURIComponent(namespace)}`;
  return {
    ...config, mode: config.mode || (new URLSearchParams(globalThis.location?.search).get('mailMode') === 'mock' ? 'mock' : 'internal'), accountId: user.id, identity: { name: user.displayName, address: user.emailAddress }, authClient: client,
    persistence: {
      async load() {
        const result = await client.request(path);
        if (result.ownerId !== user.id) { client.loseSession('account-changed'); throw Error('Account changed. Sign in again.'); }
        revision = result.revision; return result.state;
      },
      async save(state) { const result = await client.request(path, { method: 'PUT', body: { state, expectedRevision: revision } }); revision = result.revision; },
      async reset() { await client.request(path, { method: 'DELETE' }); revision = 0; },
    },
  };
}
