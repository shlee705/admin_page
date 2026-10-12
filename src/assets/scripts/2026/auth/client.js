/** Cookie credentials stay HttpOnly; only non-authenticating CSRF tokens live in memory. */
export class AuthError extends Error {
  constructor(message, status, fields = []) { super(message); this.name = 'AuthError'; this.status = status; this.fields = fields; }
}

export class AuthClient {
  constructor({ fetchImpl = globalThis.fetch, onSessionLost = () => {} } = {}) {
    this.fetch = fetchImpl.bind(globalThis); this.onSessionLost = onSessionLost; this.csrfToken = ''; this.user = null; this.expiresAt = null;
  }
  async request(path, { method = 'GET', body, csrf = true, protectedRequest = true, allowContextChange = false, verifyIdentity = true } = {}) {
    if (this.contextTransition && !allowContextChange) throw new AuthError('Account context changed; reload this page', 409);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.fetch(path, {
        method, credentials: 'same-origin', signal: controller.signal,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(method !== 'GET' && csrf ? { 'X-CSRF-Token': this.csrfToken } : {}),
          ...(verifyIdentity && this.user ? { 'X-Account-ID': this.user.id } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let data = null;
      if (response.status === 204) await response.arrayBuffer();
      else {
        try { data = await response.json(); }
        catch { if (response.ok) throw new AuthError('Account server returned an invalid response. Retry or reload.', 502); }
      }
      if (!response.ok) {
        if (response.status === 409 && data?.error?.message?.startsWith('Active account changed')) this.loseSession('account-changed');
        if (response.status === 401 && protectedRequest && this.user) this.loseSession();
        throw new AuthError(data?.error?.message || `Request failed (${response.status})`, response.status, data?.error?.fields);
      }
      const accountId = response.headers?.get('X-Account-ID');
      if (!allowContextChange && this.user && accountId && accountId !== this.user.id) {
        this.loseSession('account-changed');
        throw new AuthError('Active account changed; reload this page', 409);
      }
      return data;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError(error.name === 'AbortError' ? 'Authentication request timed out.' : 'Account server is unavailable. Start the backend and retry.', 0);
    } finally { clearTimeout(timer); }
  }
  async csrf() { const result = await this.request('/api/auth/csrf', { protectedRequest: false }); this.csrfToken = result.csrfToken; return result; }
  accept(data) {
    if (this.user && this.user.id !== data.user.id) this.contextTransition = true;
    this.user = data.user; this.csrfToken = data.csrfToken; this.expiresAt = data.expiresAt; return this.user;
  }
  async me() { return this.accept(await this.request('/api/auth/me', { allowContextChange: true, verifyIdentity: false })); }
  async register(data) { await this.csrf(); return this.request('/api/auth/register', { method: 'POST', body: data, protectedRequest: false }); }
  async login(identifier, password) {
    await this.csrf(); return this.accept(await this.request('/api/auth/login', { method: 'POST', body: { identifier, password }, protectedRequest: false, allowContextChange: true }));
  }
  accounts() { return this.request('/api/auth/accounts'); }
  async addAccount(identifier, password) {
    return this.accept(await this.request('/api/auth/accounts/add', { method: 'POST', body: { identifier, password }, protectedRequest: false, allowContextChange: true }));
  }
  async switchAccount(accountId) {
    return this.accept(await this.request('/api/auth/accounts/switch', { method: 'POST', body: { accountId }, protectedRequest: false, allowContextChange: true }));
  }
  async removeAccount(accountId) {
    const data = await this.request(`/api/auth/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE', allowContextChange: true });
    if (data.user) return this.accept(data);
    this.loseSession('logout'); return null;
  }
  async logout() {
    try { await this.request('/api/auth/logout', { method: 'POST', allowContextChange: true }); }
    catch (error) { if (error.status !== 401) throw error; this.loseSession('logout'); return; }
    try {
      return this.accept(await this.request('/api/auth/me', { protectedRequest: false, allowContextChange: true, verifyIdentity: false }));
    } catch (error) {
      // A committed logout must never leave the previous account's UI active.
      this.loseSession(error.status === 401 ? 'logout' : 'account-changed');
    }
  }
  loseSession(reason = 'session') { this.user = null; this.csrfToken = ''; this.expiresAt = null; this.contextTransition = false; this.onSessionLost(reason); }
}

export function validateRegistration(data) {
  if (!/^[a-z][a-z0-9_]{2,31}$/i.test(data.username.trim())) return 'Username must start with a letter and use 3–32 letters, numbers or underscores.';
  if (!data.displayName.trim() || [...data.displayName].length > 80 || [...data.displayName].some((char) => char.codePointAt(0) < 32 || (char.codePointAt(0) >= 127 && char.codePointAt(0) <= 159))) return 'Display Name must contain 1–80 visible characters.';
  if (data.password.length < 12 || data.password.length > 128) return 'Password must contain 12–128 characters.';
  if (data.password !== data.confirmPassword) return 'Passwords do not match.';
  return '';
}
