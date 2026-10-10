import { describe, it, expect, vi } from 'vitest';
import { AuthClient } from '../src/assets/scripts/2026/auth/client.js';
import { installAccountSwitcher } from '../src/assets/scripts/2026/auth/accounts-ui.js';

const alice = { id: 'alice-id', username: 'alice', displayName: 'Alice', emailAddress: 'alice@adminator.test' };
const bob = { id: 'bob-id', username: 'bob', displayName: 'Bob', emailAddress: 'bob@adminator.test' };
const response = (body, status = 200, accountId) => ({ ok: status < 400, status, json: async () => body, headers: new Headers(accountId ? { 'X-Account-ID': accountId } : {}) });

describe('Browser account context', () => {
  it('retains the active context on bad Add account credentials and refreshes it on switch', async () => {
    const lost = vi.fn(); const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ error: { message: 'Invalid password' } }, 401))
      .mockResolvedValueOnce(response({ user: bob, csrfToken: 'new-csrf', expiresAt: '2099-01-01' }, 200, bob.id));
    const client = new AuthClient({ fetchImpl, onSessionLost: lost }); client.user = alice; client.csrfToken = 'old-csrf';
    await expect(client.addAccount('bob', 'wrong')).rejects.toMatchObject({ status: 401 });
    expect(client.user).toEqual(alice); expect(lost).not.toHaveBeenCalled();
    await client.switchAccount(bob.id); expect(client.user).toEqual(bob); expect(client.csrfToken).toBe('new-csrf');
    expect(fetchImpl.mock.calls[1][1].headers).toMatchObject({ 'X-CSRF-Token': 'old-csrf', 'X-Account-ID': alice.id });
    await expect(client.request('/api/mail/send', { method: 'POST', body: { bodyText: 'Old UI action' } })).rejects.toMatchObject({ status: 409 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it('rejects stale private responses rather than returning another account data', async () => {
    const lost = vi.fn(); const client = new AuthClient({ onSessionLost: lost, fetchImpl: vi.fn().mockResolvedValue(response({ items: ['bob-private'] }, 200, bob.id)) });
    client.user = alice;
    await expect(client.request('/api/mail/emails')).rejects.toMatchObject({ status: 409 });
    expect(lost).toHaveBeenCalledWith('account-changed'); expect(client.user).toBeNull();
  });
  it('keeps a valid active session when the requested target has expired', async () => {
    const lost = vi.fn(); const client = new AuthClient({ onSessionLost: lost, fetchImpl: vi.fn().mockResolvedValue(response({ error: { message: 'Target expired' } }, 401)) });
    client.user = alice; client.csrfToken = 'valid';
    await expect(client.switchAccount(bob.id)).rejects.toMatchObject({ status: 401 });
    expect(client.user).toEqual(alice); expect(client.csrfToken).toBe('valid'); expect(lost).not.toHaveBeenCalled();
  });
  it('adopts the server fallback after removing the active account', async () => {
    const client = new AuthClient({ fetchImpl: vi.fn().mockResolvedValue(response({ user: alice, csrfToken: 'fallback', expiresAt: '2099-01-01' }, 200, alice.id)) });
    client.user = bob; await client.removeAccount(bob.id); expect(client.user).toEqual(alice); expect(client.csrfToken).toBe('fallback');
  });
  it('does not hide a failed Remove or discard the valid current account', async () => {
    document.body.innerHTML = '<footer></footer>';
    const client = { user: alice, accounts: vi.fn().mockResolvedValue({ accounts: [{ ...alice, active: true, canSwitch: true }, { ...bob, active: false, canSwitch: true }], maxAccounts: 10 }), removeAccount: vi.fn().mockRejectedValue(Error('Server unavailable')) };
    installAccountSwitcher(document.querySelector('footer'), client);
    const dialog = document.querySelector('dialog'); dialog.showModal = () => { dialog.open = true; };
    document.querySelector('[data-testid="switch-account"]').click();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-testid="account-row"]').length).toBe(2));
    document.querySelector(`[data-testid="account-remove-${bob.id}"]`).click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="account-error"]').textContent).toBe('Server unavailable'));
    expect(document.querySelectorAll('[data-testid="account-row"]').length).toBe(2); expect(client.user).toEqual(alice);
  });
});
