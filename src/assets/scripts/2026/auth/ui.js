import { AuthClient, validateRegistration } from './client.js';
import { installAccountSwitcher, reloadAccount } from './accounts-ui.js';

function redirect(reason = 'session') {
  document.documentElement.dataset.auth = 'checking';
  window.dispatchEvent(new Event('adminator-account-changing'));
  document.querySelector('.content')?.replaceChildren();
  if (reason === 'account-changed') { window.location.reload(); return; }
  window.location.replace(`/signin.html?reason=${encodeURIComponent(reason)}`);
}

export async function initializeAuthentication() {
  const form = document.querySelector('[data-auth-form]');
  const protectedPage = !!document.querySelector('.shell');
  if (!form && !protectedPage) return { user: null };
  document.documentElement.dataset.auth = protectedPage ? 'checking' : 'public';
  const client = new AuthClient({ onSessionLost: redirect });
  if (form) { initAuthForm(form, client); return { user: null, client }; }
  try {
    const user = await client.me();
    document.documentElement.dataset.auth = 'ready';
    installSessionChecks(client, user.id);
    return { user, client };
  } catch (error) {
    if (error.status === 401) redirect();
    else {
      const notice = document.createElement('section'); notice.className = 'auth-gate'; notice.setAttribute('role', 'alert');
      const text = document.createElement('p'); text.textContent = error.message;
      const retry = document.createElement('button'); retry.className = 'btn btn--primary'; retry.textContent = 'Retry'; retry.onclick = () => window.location.reload();
      notice.append(text, retry); document.body.prepend(notice);
    }
    return null;
  }
}

function initAuthForm(form, client) {
  const signup = form.dataset.authForm === 'register';
  const status = document.querySelector('[data-auth-status]');
  const error = document.querySelector('[data-auth-error]');
  const params = new URLSearchParams(window.location.search);
  status.textContent = params.get('registered') === '1' ? 'Account created. Sign in with your username or internal email.'
    : params.get('reason') === 'session' ? 'Sign in to continue. Your session may have expired.'
      : params.get('reason') === 'logout' ? 'Signed out.' : '';
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (form.getAttribute('aria-busy') === 'true') return;
    error.textContent = '';
    const data = Object.fromEntries(new FormData(form));
    const invalid = signup ? validateRegistration(data) : !data.identifier.trim() || !data.password ? 'Enter your username/email and password.' : '';
    if (invalid) { error.textContent = invalid; return; }
    form.setAttribute('aria-busy', 'true'); form.querySelectorAll('input,button').forEach((el) => { el.disabled = true; });
    status.textContent = signup ? 'Creating account…' : 'Signing in…';
    try {
      if (signup) {
        const result = await client.register(data); status.textContent = `Account created: ${result.user.emailAddress}`;
        window.location.assign('/signin.html?registered=1');
      } else {
        await client.login(data.identifier, data.password); status.textContent = 'Signed in. Opening Dashboard…'; window.location.assign('/index.html');
      }
    } catch (failure) { error.textContent = failure.message; status.textContent = 'Operation failed'; }
    finally { form.setAttribute('aria-busy', 'false'); form.querySelectorAll('input,button').forEach((el) => { el.disabled = false; }); }
  });
  if (signup) form.elements.username.addEventListener('input', () => {
    document.querySelector('[data-internal-email]').textContent = `${form.elements.username.value.trim().toLowerCase() || 'username'}@adminator.test`;
  });
}

function installSessionChecks(client, expectedUserId) {
  let checking = false;
  const check = async () => {
    if (checking || !client.user) return;
    checking = true;
    try {
      const user = await client.me(); if (user.id !== expectedUserId) client.loseSession('account-changed');
    } catch (error) { if (error.status === 401) client.loseSession(); }
    finally { checking = false; }
  };
  const remaining = Date.parse(client.expiresAt) - Date.now();
  // setTimeout cannot represent more than ~24 days; enforce the absolute deadline in chunks.
  const expire = () => { const left = Date.parse(client.expiresAt) - Date.now(); if (left <= 0) client.loseSession(); else setTimeout(expire, Math.min(left, 2147483647)); };
  setTimeout(expire, Math.max(0, Math.min(remaining, 2147483647)));
  setInterval(check, 60000);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', (event) => { if (event.persisted) check(); });
  if (globalThis.BroadcastChannel) {
    const channel = new BroadcastChannel('adminator-auth');
    channel.onmessage = () => {
      document.documentElement.dataset.auth = 'checking';
      window.dispatchEvent(new Event('adminator-account-changing'));
      document.querySelector('.content')?.replaceChildren();
      window.location.reload();
    };
    client.broadcastLogout = () => channel.postMessage('logout');
    client.broadcastChange = () => channel.postMessage('accounts.changed');
  }
}

export function renderCurrentUser({ user, client }) {
  if (!user) return;
  const initials = user.displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const write = (selector, text) => document.querySelectorAll(selector).forEach((el) => { el.textContent = text; });
  write('.workspace-name, .dd-profile-name', user.displayName);
  write('.workspace-role, .dd-profile-email', user.emailAddress);
  write('.workspace-avatar, .topbar-actions > .dd-wrap > .avatar', initials);
  document.querySelector('.workspace-name')?.setAttribute('data-testid', 'current-user-name');
  document.querySelector('.workspace-role')?.setAttribute('data-testid', 'current-user-email');
  const footer = document.querySelector('.sidebar-footer');
  if (footer) {
    installAccountSwitcher(footer, client);
    const menu = document.querySelector('.dd-profile');
    if (menu) { const switchButton = document.createElement('button'); switchButton.type='button'; switchButton.className='dd-menu-item'; switchButton.textContent='Switch Account'; switchButton.onclick=()=>footer.querySelector('[data-testid="switch-account"]').click(); menu.append(switchButton); }
    const logout = document.createElement('button'); logout.className = 'btn btn--ghost auth-logout'; logout.textContent = 'Log out'; logout.dataset.authLogout = ''; logout.dataset.testid = 'logout'; footer.append(logout);
  }
  document.querySelectorAll('[data-auth-logout]').forEach((button) => button.addEventListener('click', async (event) => {
    event.preventDefault(); if (window.adminatorCanLeave && !window.adminatorCanLeave()) return; button.disabled = true;
    try { await client.logout(); client.broadcastLogout?.(); if (client.user) reloadAccount(client); }
    catch (error) {
      button.disabled = false;
      let alert = document.querySelector('[data-logout-error]');
      if (!alert) { alert = document.createElement('p'); alert.dataset.logoutError = ''; alert.setAttribute('role', 'alert'); footer?.append(alert); }
      alert.textContent = error.message;
    }
  }));
}
