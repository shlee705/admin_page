import { escapeHtml as esc } from './workspace/store.js';
import { dateOnly } from './workspace/services.js';
import { canonicalPage } from './Shell.js';
import { setTheme } from './init.js';

export function resourceLink(kind, id, roomId) {
  const params = new URLSearchParams();
  if (kind === 'mail') { params.set('mailMode', 'internal'); params.set('mail', id); }
  else params.set({ calendar: 'event', chat: 'message', tasks: 'task' }[kind], id);
  if (kind === 'chat') params.set('room', roomId);
  return `${{ mail: 'email', calendar: 'calendar', chat: 'chat', tasks: 'tasks' }[kind]}.html?${params}`;
}

export class AccountPreferences {
  constructor(client) {
    this.client = client;
    this.state = { timezone: 'Asia/Seoul', theme: 'system', calendarScope: 'related', mailAutoRefresh: true, homeCards: ['calendar', 'tasks', 'mail', 'chat'], favoriteRooms: [] };
    this.revision = 0; this.status = 'unavailable'; this.error = null; this.listeners = new Set(); this.disposed = false; this.pending = null; this.queue = Promise.resolve();
    this.onAccountChange = () => this.dispose();
    window.addEventListener('adminator-account-changing', this.onAccountChange, { once: true });
  }
  get available() { return !this.disposed && this.status === 'ready'; }
  subscribe(listener) { if (!this.disposed) this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify(source, recovered = false) {
    if (this.disposed) return;
    const detail = { preferences: this, state: this.state, status: this.status, error: this.error, source, recovered };
    this.listeners.forEach(listener => listener(detail));
    window.dispatchEvent(new CustomEvent('adminator-preferences-changed', { detail }));
  }
  load() {
    if (this.disposed) return Promise.resolve(this.state);
    if (this.pending) return this.pending;
    const recovered = this.error !== null;
    this.status = 'loading'; this.notify('load');
    this.pending = (async () => {
      try {
        const result = await this.client.request('/api/preferences');
        if (this.disposed) return this.state;
        this.state = result.preferences; this.revision = result.revision; this.error = null; this.status = 'ready'; this.notify('load', recovered); return this.state;
      } catch (error) {
        if (!this.disposed) { this.error = error; this.status = 'unavailable'; this.notify('load'); }
        throw error;
      } finally { this.pending = null; }
    })();
    return this.pending;
  }
  save(patch) {
    const save = async () => {
      if (this.disposed) throw Error('Account preferences were disposed. Reload the active account.');
      if (!this.available) throw Error('Preferences unavailable. Retry loading before saving account settings.');
      try {
        const result = await this.client.request('/api/preferences', { method: 'PUT', body: { preferences: { ...this.state, ...patch }, expectedRevision: this.revision } });
        if (this.disposed) return this.state;
        this.state = result.preferences; this.revision = result.revision; this.notify('save'); return this.state;
      } catch (error) {
        if (!this.disposed) { this.error = error; this.status = 'unavailable'; this.notify('save'); }
        throw error;
      }
    };
    const result = this.queue.then(save); this.queue = result.catch(() => {}); return result;
  }
  dispose() { this.disposed = true; this.listeners.clear(); window.removeEventListener('adminator-account-changing', this.onAccountChange); }
}

export function createTask(services, title, source = null) {
  const dialog = document.createElement('dialog'); dialog.className = 'workspace-dialog';
  dialog.innerHTML = '<form><h2>Create follow-up task</h2><p>This task is private to your current account. The source remains in its original sharing scope.</p><label>Title<input name="title" maxlength="200" required></label><label>Due date<input name="dueDate" type="date"></label><p role="alert"></p><button class="btn" type="button">Cancel</button> <button class="btn btn--primary">Create task</button></form>';
  document.body.append(dialog); const form = dialog.querySelector('form'); form.elements.title.value = title.slice(0, 200);
  dialog.querySelector('button').onclick = () => dialog.close(); dialog.addEventListener('close', () => dialog.remove());
  form.onsubmit = async e => { e.preventDefault(); const submit = form.querySelector('[type="submit"]') || form.querySelector('.btn--primary'); submit.disabled = true;
    try { await services.tasks.mutate(s => s.tasks.push({ id: crypto.randomUUID(), title: form.elements.title.value.trim(), done: false, dueDate: form.elements.dueDate.value || null, priority: 'normal', description: '', source })); dialog.close(); }
    catch (error) { form.querySelector('[role="alert"]').textContent = error.message; } finally { submit.disabled = false; }
  };
  window.addEventListener('adminator-account-changing', () => dialog.close(), { once: true }); dialog.showModal(); form.elements.title.focus();
}

export function installDirtyGuard() {
  const dirty = new Set();
  document.addEventListener('input', event => { const form = event.target.closest('form') || (event.target.matches('[data-testid="chat-input"]') ? event.target : null); if (form && !event.target.matches('[type="search"], [name="attendeeSearch"], [data-recipient-search]') && !form.closest('.account-dialog')) dirty.add(form); });
  document.addEventListener('submit', event => { if (event.target.matches('[data-clean-on-submit]')) dirty.delete(event.target); });
  window.addEventListener('adminator-form-saved', event => dirty.delete(event.detail));
  const hasDirty = () => [...dirty].some(form => form.isConnected && !form.hidden && (!form.closest('dialog') || form.closest('dialog').open));
  window.adminatorCanLeave = () => !hasDirty() || window.confirm('Unsaved changes will be lost. Leave this account or page? Saved mail drafts are retained.');
  document.addEventListener('click', event => { const link = event.target.closest('a[href]'); if (link && !link.getAttribute('href').startsWith('#') && !link.hasAttribute('data-auth-logout') && hasDirty() && !window.adminatorCanLeave()) event.preventDefault(); });
  window.addEventListener('beforeunload', event => { if (hasDirty()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('adminator-account-changing', () => dirty.clear());
}

export async function initServiceHub(services, auth) {
  const active = canonicalPage(document.body.dataset.active);
  if (!['tasks', 'settings', 'people', 'search', 'attention', 'reports'].includes(active)) return;
  const main = document.querySelector('main.content');
  const labels = { tasks: 'My tasks', settings: 'Profile & preferences', people: 'People', search: 'Workspace search', attention: 'Needs attention', reports: 'Work report' };
  main.innerHTML = `<section class="hero"><div><span class="eyebrow">Your workspace</span><h1 class="hero-title">${labels[active]}</h1><p class="hero-sub">${esc(auth.user.displayName)} · ${esc(auth.user.emailAddress)}</p></div><a class="btn" href="index.html">Back to Home</a></section><p role="status" data-hub-status>Loading…</p><section class="card hub-panel" data-hub-body></section>`;
  const host = main.querySelector('[data-hub-body]'); const status = main.querySelector('[data-hub-status]');
  let busy = false; let disposed = false;
  window.addEventListener('adminator-account-changing', () => { disposed = true; host.replaceChildren(); }, { once: true });
  async function run(action, message = 'Saved.') { if (busy || disposed) return; busy = true; status.textContent = 'Loading…'; host.setAttribute('aria-busy', 'true');
    try { await action(); if (!disposed) status.textContent = message; }
    catch (e) { if (!disposed) status.textContent = `${e.message} Your unsaved input is retained. Reload to fetch latest data.`; }
    finally { busy = false; host.removeAttribute('aria-busy'); }
  }
  function clean(form) { window.dispatchEvent(new CustomEvent('adminator-form-saved', { detail: form })); }
  if (active === 'tasks') {
    await run(async () => {
      await services.tasks.load(); if (disposed) return;
      host.innerHTML = '<div class="hub-toolbar"><label>Search tasks<input type="search" data-task-query></label><label>View<select data-task-filter><option value="open">Open</option><option value="all">All</option><option value="today">Due today</option><option value="overdue">Overdue</option><option value="done">Completed</option></select></label><button class="btn" data-new-task>New task</button><button class="btn" data-reload-tasks>Reload</button></div><div class="hub-split"><div data-task-list></div><form data-task-editor><h2>Task details</h2><label>Title<input name="title" required maxlength="200"></label><label>Notes<textarea name="description" maxlength="4000"></textarea></label><label>Due date<input type="date" name="dueDate"></label><label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><label class="workspace-check"><input name="done" type="checkbox">Completed</label><div data-task-source></div><button class="btn btn--primary">Save task</button> <button type="button" class="btn" data-delete-task>Delete</button></form></div>';
      const form = host.querySelector('form'); let selected = null;
      const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: services.preferences.state.timezone }).format(new Date());
      function edit(task) { selected = task || null; form.reset(); form.elements.title.value = task?.title || ''; form.elements.description.value = task?.description || ''; form.elements.dueDate.value = task?.dueDate || ''; form.elements.priority.value = task?.priority || 'normal'; form.elements.done.checked = task?.done || false;
        host.querySelector('[data-delete-task]').hidden = !task; const source = host.querySelector('[data-task-source]'); source.innerHTML = task?.source ? `<p><a href="${esc(resourceLink(task.source.kind, task.source.id, task.source.roomId))}">Open original ${esc(task.source.kind)}</a></p><small>If the source was removed or access changed, this task is retained.</small>` : ''; clean(form);
      }
      function render() { const filter = host.querySelector('[data-task-filter]').value; const query = host.querySelector('[data-task-query]').value.toLowerCase();
        const tasks = services.tasks.state.tasks.filter(t => `${t.title} ${t.description || ''}`.toLowerCase().includes(query) && ({ all: true, open: !t.done, done: t.done, today: !t.done && t.dueDate === today(), overdue: !t.done && t.dueDate && t.dueDate < today() })[filter]).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || ({high:0,normal:1,low:2}[a.priority || 'normal'] - {high:0,normal:1,low:2}[b.priority || 'normal']));
        host.querySelector('[data-task-list]').innerHTML = tasks.map(t => `<button class="hub-item" data-edit-task="${esc(t.id)}" aria-pressed="${selected?.id === t.id}"><strong>${t.done ? '✓ ' : ''}${esc(t.title)}</strong><small>${esc(t.dueDate || 'No due date')} · ${esc(t.priority || 'normal')}</small></button>`).join('') || '<p>No tasks match this view.</p>';
        host.querySelectorAll('[data-edit-task]').forEach(b => { b.onclick = () => { if (window.adminatorCanLeave()) { edit(services.tasks.state.tasks.find(t => t.id === b.dataset.editTask)); render(); } }; });
      }
      host.querySelector('[data-task-query]').oninput = render; host.querySelector('[data-task-filter]').onchange = render;
      host.querySelector('[data-new-task]').onclick = () => { if (window.adminatorCanLeave()) { edit(); render(); form.elements.title.focus(); } };
      host.querySelector('[data-reload-tasks]').onclick = () => { if (window.adminatorCanLeave()) run(async () => { await services.tasks.load(); edit(selected && services.tasks.state.tasks.find(t => t.id === selected.id)); render(); }, 'Latest tasks loaded.'); };
      form.onsubmit = e => { e.preventDefault(); run(async () => { const old = selected; const done = form.elements.done.checked; const task = { ...old, id: old?.id || crypto.randomUUID(), title: form.elements.title.value.trim(), description: form.elements.description.value, dueDate: form.elements.dueDate.value || null, priority: form.elements.priority.value, done, completedAt: done ? old?.completedAt || new Date().toISOString() : null };
        await services.tasks.mutate(state => { const index = state.tasks.findIndex(t => t.id === task.id); if (old && index < 0) throw Error('Task no longer exists.'); if (index < 0) state.tasks.push(task); else state.tasks[index] = task; }); edit(task); render(); }); };
      host.querySelector('[data-delete-task]').onclick = () => { if (selected && window.confirm('Delete this task? The original mail, event or message will remain.')) run(async () => { await services.tasks.mutate(s => { s.tasks = s.tasks.filter(t => t.id !== selected.id); }); edit(); render(); }); };
      const id = new URLSearchParams(location.search).get('task'); const task = services.tasks.state.tasks.find(t => t.id === id); if (task) host.querySelector('[data-task-filter]').value = 'all'; edit(task); render(); if (id && !task) throw Error('Task unavailable. Choose another task or create one.');
      const unsubscribe = services.preferences.subscribe(({ status }) => { if (!disposed && status === 'ready') render(); });
      window.addEventListener('adminator-account-changing', unsubscribe, { once: true });
    }, 'Tasks loaded. Due dates use your account timezone.');
  } else if (active === 'settings') {
    const p = services.preferences.state;
    host.innerHTML = `<form data-profile-form><h2>My profile</h2><label>Display name<input name="displayName" maxlength="80" required value="${esc(auth.user.displayName)}"></label><p>Username: ${esc(auth.user.username)}<br>Internal address: ${esc(auth.user.emailAddress)}</p><button class="btn btn--primary">Save profile</button></form><hr><form data-preference-form><h2>Preferences</h2><label>IANA timezone<input name="timezone" required value="${esc(p.timezone)}" list="timezones"><datalist id="timezones"><option>Asia/Seoul</option><option>UTC</option><option>America/New_York</option><option>Europe/London</option></datalist></label><label>Theme<select name="theme">${['system','light','dark'].map(v => `<option ${p.theme === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Default calendar scope<select name="calendarScope">${['related','all','owned','invited'].map(v => `<option ${p.calendarScope === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="workspace-check"><input type="checkbox" name="mailAutoRefresh" ${p.mailAutoRefresh ? 'checked' : ''}>Refresh inbox automatically every 30 seconds</label><fieldset><legend>Home cards</legend>${['calendar','tasks','mail','chat'].map(v => `<label class="workspace-check"><input type="checkbox" name="homeCard" value="${v}" ${p.homeCards.includes(v) ? 'checked' : ''}>${v}</label>`).join('')}</fieldset><button class="btn btn--primary">Save preferences</button> <button type="button" class="btn" data-reset-home>Restore home cards</button></form><hr><p>Browser tabs share the active account. Switching reloads the page. Save mail drafts before switching.</p>`;
    host.querySelector('[data-profile-form]').onsubmit = e => { e.preventDefault(); run(async () => { const result = await services.client.request('/api/users/me', { method:'PATCH', body:{ displayName:e.target.elements.displayName.value } }); Object.assign(auth.user, result.user); document.querySelectorAll('.workspace-name,.dd-profile-name').forEach(el => { el.textContent = result.user.displayName; }); clean(e.target); }); };
    host.querySelector('[data-preference-form]').onsubmit = e => { e.preventDefault(); run(async () => { const f = e.target; await services.preferences.save({ timezone:f.elements.timezone.value, theme:f.elements.theme.value, calendarScope:f.elements.calendarScope.value, mailAutoRefresh:f.elements.mailAutoRefresh.checked, homeCards:[...f.querySelectorAll('[name="homeCard"]:checked')].map(el => el.value) }); applyPreferences(services.preferences.state); clean(f); }); };
    const preferenceForm = host.querySelector('[data-preference-form]');
    const syncPreferences = ({ state, status, source }) => {
      if (disposed) return;
      preferenceForm.querySelectorAll('input,select,button').forEach(input => { input.disabled = status !== 'ready'; });
      if (status !== 'ready' || source !== 'load') return;
      preferenceForm.elements.timezone.value = state.timezone; preferenceForm.elements.theme.value = state.theme; preferenceForm.elements.calendarScope.value = state.calendarScope; preferenceForm.elements.mailAutoRefresh.checked = state.mailAutoRefresh;
      preferenceForm.querySelectorAll('[name="homeCard"]').forEach(input => { input.checked = state.homeCards.includes(input.value); }); clean(preferenceForm);
    };
    syncPreferences({ state: p, status: services.preferences.status, source: 'load' });
    const unsubscribe = services.preferences.subscribe(syncPreferences);
    window.addEventListener('adminator-account-changing', unsubscribe, { once: true });
    const logoutAll = document.createElement('button'); logoutAll.className='btn'; logoutAll.textContent='Sign out all accounts on this browser'; host.append(logoutAll); logoutAll.onclick=()=>{if(window.adminatorCanLeave() && window.confirm('Sign out all saved accounts on this browser?')) run(async()=>{await services.client.request('/api/auth/logout-all',{method:'POST',allowContextChange:true}); services.client.broadcastChange?.(); location.replace('signin.html');});};
    host.querySelector('[data-reset-home]').onclick = () => host.querySelectorAll('[name="homeCard"]').forEach(el => { el.checked = true; }); status.textContent = 'Settings loaded.';
  } else if (active === 'people') {
    host.innerHTML = '<label>Find a member<input type="search" data-directory-query maxlength="80"></label><div data-directory-list></div><div class="hub-toolbar"><button class="btn" data-prev>Previous</button><span data-directory-count></span><button class="btn" data-next>Next</button></div>'; let offset = 0;
    let directoryTimer; const render = async () => { const r = await services.client.request(`/api/directory?q=${encodeURIComponent(host.querySelector('input').value)}&offset=${offset}`); if (disposed) return; host.querySelector('[data-directory-list]').innerHTML = r.users.map(u => `<article class="hub-item"><strong>${esc(u.displayName)}</strong><small>${esc(u.username)} · ${esc(u.emailAddress)}</small><a class="btn" href="compose.html?to=${encodeURIComponent(u.emailAddress)}">Email</a>${u.id !== auth.user.id ? `<button class="btn" data-person-chat="${esc(u.id)}">Chat</button>` : ''}</article>`).join('') || '<p>No members found.</p>'; host.querySelector('[data-directory-count]').textContent = `${r.total ? offset+1 : 0}–${Math.min(offset+25,r.total)} / ${r.total}`; host.querySelector('[data-prev]').disabled = offset === 0; host.querySelector('[data-next]').disabled = offset+25 >= r.total;
      host.querySelectorAll('[data-person-chat]').forEach(b => { b.onclick = () => run(async () => { const room = await services.liveChat.create(b.dataset.personChat); location.href = `chat.html?room=${encodeURIComponent(room.id)}`; }); }); };
    host.querySelector('input').oninput = () => { offset = 0; clearTimeout(directoryTimer); const refresh = () => {if(busy) {directoryTimer=setTimeout(refresh,150);return;} run(render,'Members loaded.');}; directoryTimer=setTimeout(refresh,150); }; window.addEventListener('pagehide',()=>clearTimeout(directoryTimer),{once:true}); host.querySelector('[data-prev]').onclick = () => { offset = Math.max(0,offset-25); run(render, 'Members loaded.'); }; host.querySelector('[data-next]').onclick = () => { offset += 25; run(render, 'Members loaded.'); }; await run(render, 'Active members. Only public contact fields are shown.');
  } else if (active === 'search') {
    host.innerHTML = '<form data-clean-on-submit class="hub-toolbar"><label>Search<input name="q" type="search" minlength="2" maxlength="200" required></label><label>Type<select name="kind"><option value="all">All</option><option value="tasks">Tasks</option><option value="calendar">Calendar</option><option value="mail">Mail</option><option value="chat">Chat messages</option></select></label><button class="btn">Search</button></form><div data-results></div>';
    const form = host.querySelector('form'); const params = new URLSearchParams(location.search); form.elements.q.value = params.get('q') || ''; if (['tasks','calendar','mail','chat'].includes(params.get('kind'))) form.elements.kind.value = params.get('kind');
    const search = () => run(async () => { const r = await services.client.request(`/api/search?${new URLSearchParams({q:form.elements.q.value,kind:form.elements.kind.value})}`); if (!disposed) host.querySelector('[data-results]').innerHTML = r.results.map(r => `<a class="hub-item" href="${esc(r.href)}"><strong>${esc(r.title)}</strong><small>${esc(r.kind)} · ${esc(r.text)}</small></a>`).join('') || '<p>No results in accessible resources.</p>'; if (r.hasMore) status.textContent = 'First 50 matches shown. Refine your search.'; }, 'Search complete.');
    form.onsubmit = e => { e.preventDefault(); search(); }; if (form.elements.q.value.length >= 2) await search(); else status.textContent = 'Enter at least two characters.';
  } else if (active === 'attention') {
    host.innerHTML = '<button class="btn" data-refresh-attention>Refresh</button><div data-attention-items></div>'; const render = async () => { const r = await services.client.request('/api/attention'); if (!disposed) host.querySelector('[data-attention-items]').innerHTML = r.items.map(i => `<a class="hub-item" href="${esc(i.href)}"><strong>${esc(i.title)}</strong><small>${esc(i.kind)} · ${esc(i.detail)}</small></a>`).join('') || '<p>Nothing needs attention. You are up to date.</p>'; };
    host.querySelector('button').onclick = () => run(render, 'Updated.'); await run(render, 'Original read/RSVP/task states determine this list.');
  } else if (active === 'reports') {
    host.innerHTML = '<label>Period<select><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label><div data-report></div>'; const render = async () => { const r = await services.client.request(`/api/reports/tasks?days=${host.querySelector('select').value}`); if (disposed) return; host.querySelector('[data-report]').innerHTML = `<h2>Task completion · ${r.open} currently open</h2><p>${esc(r.definition)}</p><p>${r.unrecordedCompleted} legacy completed tasks have no recorded completion date.</p><div class="hub-table-wrap"><table><thead><tr><th>Date</th><th>Completed</th></tr></thead><tbody>${r.days.map((d,i) => `<tr><td>${d}</td><td><meter min="0" max="${Math.max(1,...r.completed)}" value="${r.completed[i]}">${r.completed[i]}</meter> ${r.completed[i]}</td></tr>`).join('')}</tbody></table></div>`; };
    host.querySelector('select').onchange = () => run(render, 'Report updated.'); await run(render, 'Account task report. Counts are not performance scores.');
  }
}

export function applyPreferences(p) {
  const theme = p.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p.theme;
  setTheme(theme);
}

export function taskCompletion(task, done) { task.done = done; task.completedAt = done ? task.completedAt || new Date().toISOString() : null; }
export { dateOnly };
