/** Only public account metadata reaches the DOM; credentials live in the form until submission. */
export function reloadAccount(client) {
  document.documentElement.dataset.auth = 'checking';
  window.dispatchEvent(new Event('adminator-account-changing'));
  document.querySelector('.content')?.replaceChildren();
  client.broadcastChange?.();
  window.location.reload();
}

export function installAccountSwitcher(footer, client) {
  const trigger = document.createElement('button'); trigger.className = 'btn btn--ghost auth-switch';
  trigger.textContent = 'Switch Account'; trigger.dataset.testid = 'switch-account';
  trigger.setAttribute('aria-haspopup', 'dialog'); footer.append(trigger);
  const dialog = document.createElement('dialog'); dialog.className = 'workspace-dialog account-dialog';
  dialog.dataset.testid = 'account-dialog'; dialog.setAttribute('aria-labelledby', 'account-switch-title');
  dialog.innerHTML = `<h2 id="account-switch-title">Switch Account</h2><p>Choose an account already signed in on this browser.</p><div class="account-list" data-testid="account-list"></div><button type="button" class="btn" data-testid="add-account">Add account</button><form class="account-add-form" data-testid="account-add-form" hidden><h3>Add account</h3><label>Username or Email<input name="identifier" autocomplete="username" required maxlength="255" data-testid="account-add-identifier"></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="128" data-testid="account-add-password"></label><button class="btn btn--primary" data-testid="account-add-submit">Sign in and add</button></form><p role="status" data-testid="account-status"></p><p role="alert" data-testid="account-error"></p><button type="button" class="btn" data-testid="account-close">Close</button>`;
  document.body.append(dialog);
  const list = dialog.querySelector('[data-testid="account-list"]'); const form = dialog.querySelector('form');
  const status = dialog.querySelector('[role="status"]'); const error = dialog.querySelector('[role="alert"]');
  let busy = false;
  window.addEventListener('adminator-account-changing', () => { form.reset(); list.replaceChildren(); if (dialog.open) dialog.close(); });
  function loading(value) {
    busy = value; dialog.setAttribute('aria-busy', String(value));
    dialog.querySelectorAll('button,input').forEach(control => { control.disabled = value || control.dataset.unavailable === 'true'; });
  }
  async function run(action) {
    if (busy) return;
    loading(true); error.textContent = ''; status.textContent = 'Updating account…';
    try { await action(); }
    catch (failure) { error.textContent = failure.message; status.textContent = 'Account was not changed. Retry or sign in again.'; }
    finally { loading(false); }
  }
  async function render() {
    const result = await client.accounts(); list.replaceChildren();
    for (const account of result.accounts) {
      const row = document.createElement('div'); row.className = 'account-row'; row.dataset.testid = 'account-row'; row.dataset.accountId = account.id;
      const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'account-choice';
      choose.dataset.testid = `account-switch-${account.id}`;
      choose.dataset.unavailable = String(account.active || !account.canSwitch);
      choose.disabled = account.active || !account.canSwitch;
      choose.setAttribute('aria-pressed', String(account.active));
      const icon = document.createElement('span'); icon.className = 'account-avatar'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = account.displayName.slice(0, 2).toUpperCase();
      const details = document.createElement('span'); details.className = 'account-details';
      const name = document.createElement('strong'); name.textContent = `${account.active ? '✓ ' : ''}${account.username}`;
      const email = document.createElement('small'); email.textContent = account.emailAddress;
      const state = document.createElement('small'); state.textContent = account.active ? 'Current account' : account.canSwitch ? 'Signed in' : 'Expired or disabled · Sign in again';
      details.append(name, email, state); choose.append(icon, details);
      choose.onclick = () => { if (window.adminatorCanLeave && !window.adminatorCanLeave()) return; return run(async () => { await client.switchAccount(account.id); form.reset(); dialog.close(); reloadAccount(client); }); };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn--ghost'; remove.textContent = 'Remove';
      remove.dataset.testid = `account-remove-${account.id}`; remove.setAttribute('aria-label', `Remove ${account.username} from this browser`);
      remove.onclick = () => { if (window.adminatorCanLeave && !window.adminatorCanLeave()) return; return run(async () => { await client.removeAccount(account.id); form.reset(); dialog.close(); if (client.user) reloadAccount(client); else client.broadcastChange?.(); }); };
      row.append(choose, remove); list.append(row);
    }
    status.textContent = `${result.accounts.length} / ${result.maxAccounts} accounts · Remove signs out only this browser.`;
  }
  trigger.onclick = () => {
    form.reset(); form.hidden = true; list.replaceChildren(); error.textContent = ''; dialog.showModal();
    run(render);
  };
  dialog.querySelector('[data-testid="add-account"]').onclick = () => { form.hidden = !form.hidden; if (!form.hidden) form.elements.identifier.focus(); };
  form.onsubmit = event => {
    event.preventDefault(); const identifier = form.elements.identifier.value.trim(); const password = form.elements.password.value;
    if (!identifier || !password) { error.textContent = 'Enter your username/email and password.'; return; }
    if (window.adminatorCanLeave && !window.adminatorCanLeave()) return;
    run(async () => {
      try { await client.addAccount(identifier, password); }
      finally { form.elements.password.value = ''; }
      form.reset(); dialog.close(); reloadAccount(client);
    });
  };
  dialog.querySelector('[data-testid="account-close"]').onclick = () => { form.reset(); dialog.close(); trigger.focus(); };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); else form.reset(); });
}
