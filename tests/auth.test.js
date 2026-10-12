import { describe, expect, it, vi } from 'vitest';
import { AuthClient, validateRegistration } from '../src/assets/scripts/2026/auth/client.js';
import { accountEmailConfig } from '../src/assets/scripts/2026/email/account-persistence.js';
import { createEmailService } from '../src/assets/scripts/2026/email/service.js';
import { renderCurrentUser } from '../src/assets/scripts/2026/auth/ui.js';

const result = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const user = { id: 'account-a', username: 'alice', displayName: '<Alice>', emailAddress: 'alice@adminator.test' };

describe('Authentication client', () => {
  it('preserves HTTP errors from non-JSON proxies and expires sessions on non-JSON 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw Error('HTML'); } })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => { throw Error('HTML'); } });
    const lost = vi.fn(); const client = new AuthClient({ fetchImpl, onSessionLost: lost }); client.user = user;
    await expect(client.request('/api/mail/emails')).rejects.toMatchObject({ status: 502 });
    expect(client.user).toEqual(user);
    await expect(client.request('/api/mail/emails')).rejects.toMatchObject({ status: 401 });
    expect(client.user).toBeNull(); expect(lost).toHaveBeenCalledWith('session');
  });
  it('counts Unicode code points and rejects C1 controls consistently with the server', () => {
    const data = { username: 'alice', password: 'test password!', confirmPassword: 'test password!' };
    expect(validateRegistration({ ...data, displayName: '😀'.repeat(80) })).toBe('');
    expect(validateRegistration({ ...data, displayName: '😀'.repeat(81) })).not.toBe('');
    expect(validateRegistration({ ...data, displayName: 'a\u0085b' })).not.toBe('');
    expect(validateRegistration({ ...data, displayName: 'é 👩‍💻' })).toBe('');
  });
  it('sends cookie credentials and an in-memory synchronizer CSRF token for registration/login', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(result({ csrfToken: 'preauth' })).mockResolvedValueOnce(result({ user }, 201))
      .mockResolvedValueOnce(result({ csrfToken: 'preauth' })).mockResolvedValueOnce(result({ user, csrfToken: 'rotated', expiresAt: '2026-10-10T00:00:00Z' }));
    const client = new AuthClient({ fetchImpl });
    await client.register({ username: 'alice' }); await client.login('alice', 'password');
    expect(fetchImpl.mock.calls[1][1].headers['X-CSRF-Token']).toBe('preauth');
    expect(fetchImpl.mock.calls[3][1].credentials).toBe('same-origin');
    expect(client.user).toEqual(user); expect(client.csrfToken).toBe('rotated'); expect(localStorage.length).toBe(0);
  });
  it('restores from /me and clears state when a protected API returns 401', async () => {
    const onSessionLost = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValueOnce(result({ user, csrfToken: 'csrf', expiresAt: '2026-10-10T00:00:00Z' }))
      .mockResolvedValueOnce(result({ error: { message: 'Session expired' } }, 401));
    const client = new AuthClient({ fetchImpl, onSessionLost }); await client.me();
    await expect(client.request('/api/users/me')).rejects.toMatchObject({ status: 401 });
    expect(client.user).toBeNull(); expect(client.csrfToken).toBe(''); expect(onSessionLost).toHaveBeenCalledWith('session');
  });
  it('shows invalid credentials without treating a login failure as authenticated session loss', async () => {
    const onSessionLost = vi.fn();
    const client = new AuthClient({ onSessionLost, fetchImpl: vi.fn().mockResolvedValueOnce(result({ csrfToken: 'csrf' })).mockResolvedValueOnce(result({ error: { message: 'Invalid username/email or password' } }, 401)) });
    await expect(client.login('alice', 'wrong')).rejects.toThrow('Invalid username'); expect(onSessionLost).not.toHaveBeenCalled();
  });
  it('does not claim logout succeeded on network failures', async () => {
    const onSessionLost = vi.fn(); const client = new AuthClient({ onSessionLost, fetchImpl: vi.fn().mockRejectedValue(Error('offline')) });
    client.user = user;
    await expect(client.logout()).rejects.toMatchObject({ status: 0 }); expect(client.user).toEqual(user); expect(onSessionLost).not.toHaveBeenCalled();
  });
  it('validates canonical usernames, display name, password length and confirmation', () => {
    const valid = { username: 'Alice_01', displayName: 'Alice', password: 'test password!', confirmPassword: 'test password!' };
    expect(validateRegistration(valid)).toBe('');
    for (const change of [{ username: 'ab' }, { username: 'élice' }, { username: 'bad-name' }, { displayName: '\nBad' }, { password: 'short' }, { confirmPassword: 'different' }]) expect(validateRegistration({ ...valid, ...change })).not.toBe('');
  });
});

describe('Account-owned email boundary and profile', () => {
  it('uses authenticated identity even when configuration attempts to supply another account', async () => {
    let snapshot = null; let revision = 0;
    const client = { request: vi.fn(async (_, options = {}) => {
      if (options.method === 'PUT') { expect(options.body.expectedRevision).toBe(revision); snapshot = options.body.state; return { revision: ++revision }; }
      if (options.method === 'DELETE') { snapshot = null; revision = 0; return null; }
      return { ownerId: user.id, revision, state: snapshot };
    }) };
    const config = accountEmailConfig(user, client, { mode: 'mock', accountId: 'bob', identity: { address: 'bob@adminator.test' }, latency: 0 });
    const service = createEmailService(config);
    const mail = await service.sendEmail({ to: 'bob@adminator.test', subject: 'Private mock', bodyText: 'Test' });
    expect(mail.email.accountId).toBe(user.id); expect(mail.email.from.address).toBe(user.emailAddress);
    expect((await service.getEmailById('sample-1')).to[0].address).toBe(user.emailAddress);
    expect(localStorage.length).toBe(0); await service.reset(); expect(snapshot).toBeNull();
  });
  it('rejects a mailbox returned after another tab switches the session account', async () => {
    const client = { request: vi.fn().mockResolvedValue({ ownerId: 'bob', revision: 1, state: {} }), loseSession: vi.fn() };
    await expect(accountEmailConfig(user, client).persistence.load()).rejects.toThrow('Account changed');
    expect(client.loseSession).toHaveBeenCalledWith('account-changed');
  });
  it('renders profile values as text rather than markup', () => {
    document.body.innerHTML = '<div class="sidebar-footer"><div class="workspace-name"></div><div class="workspace-role"></div><div class="workspace-avatar"></div></div>';
    renderCurrentUser({ user, client: {} });
    expect(document.querySelector('[data-testid="current-user-name"]').textContent).toBe('<Alice>');
    expect(document.querySelector('alice')).toBeNull(); expect(document.querySelector('[data-testid="logout"]')).toBeTruthy();
  });
});
