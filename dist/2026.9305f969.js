"use strict";
(self["webpackChunk"] = self["webpackChunk"] || []).push([[1],{

/***/ 252
(__unused_webpack_module, __unused_webpack___webpack_exports__, __webpack_require__) {


;// ./assets/scripts/2026/workspace/store.js
/** Account-scoped snapshot adapter. Replace this adapter with resource APIs later. */
class WorkspaceStore {
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
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function exportJson(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

;// ./assets/scripts/2026/service-hub.js



function resourceLink(kind, id, roomId) {
  const params = new URLSearchParams();
  if (kind === 'mail') { params.set('mailMode', 'internal'); params.set('mail', id); }
  else params.set({ calendar: 'event', chat: 'message', tasks: 'task' }[kind], id);
  if (kind === 'chat') params.set('room', roomId);
  return `${{ mail: 'email', calendar: 'calendar', chat: 'chat', tasks: 'tasks' }[kind]}.html?${params}`;
}

class AccountPreferences {
  constructor(client) { this.client = client; this.state = null; this.revision = 0; }
  async load() { const result = await this.client.request('/api/preferences'); this.state = result.preferences; this.revision = result.revision; return this.state; }
  async save(patch) { const result = await this.client.request('/api/preferences', { method: 'PUT', body: { preferences: { ...this.state, ...patch }, expectedRevision: this.revision } }); this.state = result.preferences; this.revision = result.revision; return this.state; }
}

function createTask(services, title, source = null) {
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

function installDirtyGuard() {
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

async function initServiceHub(services, auth) {
  const aliases = { forms: 'settings', charts: 'reports', blank: 'settings', 'basic-table': 'calendar' };
  const active = aliases[document.body.dataset.active] || document.body.dataset.active;
  if (!['tasks', 'settings', 'people', 'search', 'attention', 'reports'].includes(active)) return;
  const main = document.querySelector('main.content');
  const labels = { tasks: 'My tasks', settings: 'Profile & preferences', people: 'People', search: 'Workspace search', attention: 'Needs attention', reports: 'Work report' };
  main.innerHTML = `<section class="hero"><div><span class="eyebrow">Your workspace</span><h1 class="hero-title">${labels[active]}</h1><p class="hero-sub">${escapeHtml(auth.user.displayName)} · ${escapeHtml(auth.user.emailAddress)}</p></div><a class="btn" href="index.html">Back to Home</a></section><p role="status" data-hub-status>Loading…</p><section class="card hub-panel" data-hub-body></section>`;
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
        host.querySelector('[data-delete-task]').hidden = !task; const source = host.querySelector('[data-task-source]'); source.innerHTML = task?.source ? `<p><a href="${escapeHtml(resourceLink(task.source.kind, task.source.id, task.source.roomId))}">Open original ${escapeHtml(task.source.kind)}</a></p><small>If the source was removed or access changed, this task is retained.</small>` : ''; clean(form);
      }
      function render() { const filter = host.querySelector('[data-task-filter]').value; const query = host.querySelector('[data-task-query]').value.toLowerCase();
        const tasks = services.tasks.state.tasks.filter(t => `${t.title} ${t.description || ''}`.toLowerCase().includes(query) && ({ all: true, open: !t.done, done: t.done, today: !t.done && t.dueDate === today(), overdue: !t.done && t.dueDate && t.dueDate < today() })[filter]).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || ({high:0,normal:1,low:2}[a.priority || 'normal'] - {high:0,normal:1,low:2}[b.priority || 'normal']));
        host.querySelector('[data-task-list]').innerHTML = tasks.map(t => `<button class="hub-item" data-edit-task="${escapeHtml(t.id)}" aria-pressed="${selected?.id === t.id}"><strong>${t.done ? '✓ ' : ''}${escapeHtml(t.title)}</strong><small>${escapeHtml(t.dueDate || 'No due date')} · ${escapeHtml(t.priority || 'normal')}</small></button>`).join('') || '<p>No tasks match this view.</p>';
        host.querySelectorAll('[data-edit-task]').forEach(b => { b.onclick = () => { if (window.adminatorCanLeave()) { edit(services.tasks.state.tasks.find(t => t.id === b.dataset.editTask)); render(); } }; });
      }
      host.querySelector('[data-task-query]').oninput = render; host.querySelector('[data-task-filter]').onchange = render;
      host.querySelector('[data-new-task]').onclick = () => { if (window.adminatorCanLeave()) { edit(); render(); form.elements.title.focus(); } };
      host.querySelector('[data-reload-tasks]').onclick = () => { if (window.adminatorCanLeave()) run(async () => { await services.tasks.load(); edit(selected && services.tasks.state.tasks.find(t => t.id === selected.id)); render(); }, 'Latest tasks loaded.'); };
      form.onsubmit = e => { e.preventDefault(); run(async () => { const old = selected; const done = form.elements.done.checked; const task = { ...old, id: old?.id || crypto.randomUUID(), title: form.elements.title.value.trim(), description: form.elements.description.value, dueDate: form.elements.dueDate.value || null, priority: form.elements.priority.value, done, completedAt: done ? old?.completedAt || new Date().toISOString() : null };
        await services.tasks.mutate(state => { const index = state.tasks.findIndex(t => t.id === task.id); if (old && index < 0) throw Error('Task no longer exists.'); if (index < 0) state.tasks.push(task); else state.tasks[index] = task; }); edit(task); render(); }); };
      host.querySelector('[data-delete-task]').onclick = () => { if (selected && window.confirm('Delete this task? The original mail, event or message will remain.')) run(async () => { await services.tasks.mutate(s => { s.tasks = s.tasks.filter(t => t.id !== selected.id); }); edit(); render(); }); };
      const id = new URLSearchParams(location.search).get('task'); const task = services.tasks.state.tasks.find(t => t.id === id); if (task) host.querySelector('[data-task-filter]').value = 'all'; edit(task); render(); if (id && !task) throw Error('Task unavailable. Choose another task or create one.');
    }, 'Tasks loaded. Due dates use your account timezone.');
  } else if (active === 'settings') {
    const p = services.preferences.state;
    host.innerHTML = `<form data-profile-form><h2>My profile</h2><label>Display name<input name="displayName" maxlength="80" required value="${escapeHtml(auth.user.displayName)}"></label><p>Username: ${escapeHtml(auth.user.username)}<br>Internal address: ${escapeHtml(auth.user.emailAddress)}</p><button class="btn btn--primary">Save profile</button></form><hr><form data-preference-form><h2>Preferences</h2><label>IANA timezone<input name="timezone" required value="${escapeHtml(p.timezone)}" list="timezones"><datalist id="timezones"><option>Asia/Seoul</option><option>UTC</option><option>America/New_York</option><option>Europe/London</option></datalist></label><label>Theme<select name="theme">${['system','light','dark'].map(v => `<option ${p.theme === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Default calendar scope<select name="calendarScope">${['related','all','owned','invited'].map(v => `<option ${p.calendarScope === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="workspace-check"><input type="checkbox" name="mailAutoRefresh" ${p.mailAutoRefresh ? 'checked' : ''}>Refresh inbox automatically every 30 seconds</label><fieldset><legend>Home cards</legend>${['calendar','tasks','mail','chat'].map(v => `<label class="workspace-check"><input type="checkbox" name="homeCard" value="${v}" ${p.homeCards.includes(v) ? 'checked' : ''}>${v}</label>`).join('')}</fieldset><button class="btn btn--primary">Save preferences</button> <button type="button" class="btn" data-reset-home>Restore home cards</button></form><hr><p>Browser tabs share the active account. Switching reloads the page. Save mail drafts before switching.</p>`;
    host.querySelector('[data-profile-form]').onsubmit = e => { e.preventDefault(); run(async () => { const result = await services.client.request('/api/users/me', { method:'PATCH', body:{ displayName:e.target.elements.displayName.value } }); Object.assign(auth.user, result.user); document.querySelectorAll('.workspace-name,.dd-profile-name').forEach(el => { el.textContent = result.user.displayName; }); clean(e.target); }); };
    host.querySelector('[data-preference-form]').onsubmit = e => { e.preventDefault(); run(async () => { const f = e.target; await services.preferences.save({ timezone:f.elements.timezone.value, theme:f.elements.theme.value, calendarScope:f.elements.calendarScope.value, mailAutoRefresh:f.elements.mailAutoRefresh.checked, homeCards:[...f.querySelectorAll('[name="homeCard"]:checked')].map(el => el.value) }); applyPreferences(services.preferences.state); clean(f); }); };
    const logoutAll = document.createElement('button'); logoutAll.className='btn'; logoutAll.textContent='Sign out all accounts on this browser'; host.append(logoutAll); logoutAll.onclick=()=>{if(window.adminatorCanLeave() && window.confirm('Sign out all saved accounts on this browser?')) run(async()=>{await services.client.request('/api/auth/logout-all',{method:'POST',allowContextChange:true}); services.client.broadcastChange?.(); location.replace('signin.html');});};
    host.querySelector('[data-reset-home]').onclick = () => host.querySelectorAll('[name="homeCard"]').forEach(el => { el.checked = true; }); status.textContent = 'Settings loaded.';
  } else if (active === 'people') {
    host.innerHTML = '<label>Find a member<input type="search" data-directory-query maxlength="80"></label><div data-directory-list></div><div class="hub-toolbar"><button class="btn" data-prev>Previous</button><span data-directory-count></span><button class="btn" data-next>Next</button></div>'; let offset = 0;
    let directoryTimer; const render = async () => { const r = await services.client.request(`/api/directory?q=${encodeURIComponent(host.querySelector('input').value)}&offset=${offset}`); if (disposed) return; host.querySelector('[data-directory-list]').innerHTML = r.users.map(u => `<article class="hub-item"><strong>${escapeHtml(u.displayName)}</strong><small>${escapeHtml(u.username)} · ${escapeHtml(u.emailAddress)}</small><a class="btn" href="compose.html?to=${encodeURIComponent(u.emailAddress)}">Email</a>${u.id !== auth.user.id ? `<button class="btn" data-person-chat="${escapeHtml(u.id)}">Chat</button>` : ''}</article>`).join('') || '<p>No members found.</p>'; host.querySelector('[data-directory-count]').textContent = `${r.total ? offset+1 : 0}–${Math.min(offset+25,r.total)} / ${r.total}`; host.querySelector('[data-prev]').disabled = offset === 0; host.querySelector('[data-next]').disabled = offset+25 >= r.total;
      host.querySelectorAll('[data-person-chat]').forEach(b => { b.onclick = () => run(async () => { const room = await services.liveChat.create(b.dataset.personChat); location.href = `chat.html?room=${encodeURIComponent(room.id)}`; }); }); };
    host.querySelector('input').oninput = () => { offset = 0; clearTimeout(directoryTimer); const refresh = () => {if(busy) {directoryTimer=setTimeout(refresh,150);return;} run(render,'Members loaded.');}; directoryTimer=setTimeout(refresh,150); }; window.addEventListener('pagehide',()=>clearTimeout(directoryTimer),{once:true}); host.querySelector('[data-prev]').onclick = () => { offset = Math.max(0,offset-25); run(render, 'Members loaded.'); }; host.querySelector('[data-next]').onclick = () => { offset += 25; run(render, 'Members loaded.'); }; await run(render, 'Active members. Only public contact fields are shown.');
  } else if (active === 'search') {
    host.innerHTML = '<form data-clean-on-submit class="hub-toolbar"><label>Search<input name="q" type="search" minlength="2" maxlength="200" required></label><label>Type<select name="kind"><option value="all">All</option><option value="tasks">Tasks</option><option value="calendar">Calendar</option><option value="mail">Mail</option><option value="chat">Chat messages</option></select></label><button class="btn">Search</button></form><div data-results></div>';
    const form = host.querySelector('form'); const params = new URLSearchParams(location.search); form.elements.q.value = params.get('q') || ''; if (['tasks','calendar','mail','chat'].includes(params.get('kind'))) form.elements.kind.value = params.get('kind');
    const search = () => run(async () => { const r = await services.client.request(`/api/search?${new URLSearchParams({q:form.elements.q.value,kind:form.elements.kind.value})}`); if (!disposed) host.querySelector('[data-results]').innerHTML = r.results.map(r => `<a class="hub-item" href="${escapeHtml(r.href)}"><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.kind)} · ${escapeHtml(r.text)}</small></a>`).join('') || '<p>No results in accessible resources.</p>'; if (r.hasMore) status.textContent = 'First 50 matches shown. Refine your search.'; }, 'Search complete.');
    form.onsubmit = e => { e.preventDefault(); search(); }; if (form.elements.q.value.length >= 2) await search(); else status.textContent = 'Enter at least two characters.';
  } else if (active === 'attention') {
    host.innerHTML = '<button class="btn" data-refresh-attention>Refresh</button><div data-attention-items></div>'; const render = async () => { const r = await services.client.request('/api/attention'); if (!disposed) host.querySelector('[data-attention-items]').innerHTML = r.items.map(i => `<a class="hub-item" href="${escapeHtml(i.href)}"><strong>${escapeHtml(i.title)}</strong><small>${escapeHtml(i.kind)} · ${escapeHtml(i.detail)}</small></a>`).join('') || '<p>Nothing needs attention. You are up to date.</p>'; };
    host.querySelector('button').onclick = () => run(render, 'Updated.'); await run(render, 'Original read/RSVP/task states determine this list.');
  } else if (active === 'reports') {
    host.innerHTML = '<label>Period<select><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label><div data-report></div>'; const render = async () => { const r = await services.client.request(`/api/reports/tasks?days=${host.querySelector('select').value}`); if (disposed) return; host.querySelector('[data-report]').innerHTML = `<h2>Task completion · ${r.open} currently open</h2><p>${escapeHtml(r.definition)}</p><p>${r.unrecordedCompleted} legacy completed tasks have no recorded completion date.</p><div class="hub-table-wrap"><table><thead><tr><th>Date</th><th>Completed</th></tr></thead><tbody>${r.days.map((d,i) => `<tr><td>${d}</td><td><meter min="0" max="${Math.max(1,...r.completed)}" value="${r.completed[i]}">${r.completed[i]}</meter> ${r.completed[i]}</td></tr>`).join('')}</tbody></table></div>`; };
    host.querySelector('select').onchange = () => run(render, 'Report updated.'); await run(render, 'Account task report. Counts are not performance scores.');
  }
}

function applyPreferences(p) {
  const theme = p.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p.theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('dash26-theme', theme);
}

function taskCompletion(task, done) { task.done = done; task.completedAt = done ? task.completedAt || new Date().toISOString() : null; }


;// ./assets/scripts/2026/template-pages.js


/** Template galleries remain explicit examples; useful exports operate on visible content. */
function initTemplatePages() {
  const kind = document.body.dataset.active;
  if (!['charts','forms','buttons','ui','basic-table','datatable','google-maps','vector-maps','blank'].includes(kind)) return;
  const main = document.querySelector('main'); const notice = document.createElement('p'); notice.className = 'workspace-sample'; notice.dataset.testid = 'template-mode'; notice.textContent = 'Template example · Sample data and controls. These examples do not manage real account roles, profiles, sales or locations.'; main.querySelector('.hero').after(notice);
  function download(name, blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
  function csv(table) { return [...table.querySelectorAll('tr')].filter(row => !row.hidden).map(row => [...row.querySelectorAll('th,td')].map(cell => `"${cell.innerText.trim().replaceAll('"','""')}"`).join(',')).join('\r\n'); }
  if (['basic-table','datatable'].includes(kind)) {
    const table = main.querySelector('table');
    main.querySelector('.hero-actions button').onclick = () => download(`${kind}-samples.csv`,new Blob([csv(table)],{type:'text/csv;charset=utf-8'}));
    if (kind === 'datatable') {
      const search = main.querySelector('input[type="search"]'); search.dataset.testid = 'table-search'; search.oninput = () => { table.querySelectorAll('tbody tr').forEach(row => { row.hidden = !row.innerText.toLowerCase().includes(search.value.toLowerCase()); }); notice.textContent = `Template sample · ${[...table.querySelectorAll('tbody tr')].filter(row => !row.hidden).length} matching rows. Export downloads these visible samples.`; };
      main.querySelectorAll('.data-cell-actions button').forEach(button => { if (button.getAttribute('aria-label') === 'View') button.onclick = () => { const dialog = document.createElement('dialog'); dialog.className = 'workspace-dialog'; dialog.innerHTML = `<h2>Sample row</h2><p>${escapeHtml(button.closest('tr').innerText)}</p><p>Template fixture, not a registered account.</p><button class="btn">Close</button>`; document.body.append(dialog); dialog.querySelector('button').onclick = () => { dialog.close(); dialog.remove(); }; dialog.oncancel = () => dialog.remove(); dialog.showModal(); }; });
    }
  }
  if (kind === 'charts') main.querySelector('.hero-actions button').onclick = () => { const canvas = main.querySelector('canvas'); if (canvas) { const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = 'chart-sample.png'; link.click(); } };
  if (kind === 'vector-maps') main.querySelector('.hero-actions button').onclick = () => { const svg = main.querySelector('[data-vmap] svg'); if (svg) download('map-sample.svg',new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'})); else notice.textContent = 'Map is still loading. Retry export.'; };
  if (kind === 'forms') {
    const form = main.querySelector('form'); form.removeAttribute('onsubmit');
    const submit = () => { if(form.reportValidity()) notice.textContent = 'Demo form validated. No account profile or role changes were saved.'; };
    form.onsubmit = event => { event.preventDefault(); submit(); };
    main.querySelectorAll('button').forEach(button => { if(button.textContent.trim()==='Save changes') button.onclick=submit; if(button.textContent.trim()==='Cancel') button.onclick=()=>{ form.reset(); notice.textContent='Demo form reset.'; }; });
  }
}

;// ./assets/scripts/2026/Shell.js
/**
 * 2026 Shell renderer.
 *
 * Each page provides:
 *   <body data-active="dashboard" data-crumbs="Workspace | Dashboard">
 *     <div class="shell">
 *       <div data-shell-sidebar></div>
 *       <div class="main">
 *         <div data-shell-topbar></div>
 *         <main class="content"> ...page content... </main>
 *         <div data-shell-footer></div>
 *       </div>
 *     </div>
 *   </body>
 *
 * mountShell() fills the three placeholder divs with the shared chrome,
 * marking the active sidebar item and writing the breadcrumbs.
 *
 * NAV is the single source of truth — adding a page is one entry here.
 */

const navIcon = '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 10h10M7 14h7"/>';
const NAV = [
  { label: 'Work', items: [
    { key: 'dashboard', text: 'Home', href: 'index.html', icon: navIcon },
    { key: 'tasks', text: 'My tasks', href: 'tasks.html', icon: navIcon },
    { key: 'calendar', text: 'Calendar', href: 'calendar.html', icon: navIcon },
    { key: 'reports', text: 'Work report', href: 'reports.html', icon: navIcon },
  ] },
  { label: 'Collaboration', items: [
    { key: 'email', text: 'Email', href: 'email.html', icon: navIcon },
    { key: 'chat', text: 'Chat', href: 'chat.html', icon: navIcon },
    { key: 'people', text: 'People', href: 'people.html', icon: navIcon },
    { key: 'attention', text: 'Needs attention', href: 'attention.html', icon: navIcon },
  ] },
];

const BRAND_LOGO = `<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
  <path fill="#ffffff" d="M14.747 9.125c.527-1.426 1.736-2.573 3.317-2.573c1.643 0 2.792 1.085 3.318 2.573l6.077 16.867c.186.496.248.931.248 1.147c0 1.209-.992 2.046-2.139 2.046c-1.303 0-1.954-.682-2.264-1.611l-.931-2.915h-8.62l-.93 2.884c-.31.961-.961 1.642-2.232 1.642c-1.24 0-2.294-.93-2.294-2.17c0-.496.155-.868.217-1.023l6.233-16.867zm.34 11.256h5.891l-2.883-8.992h-.062l-2.946 8.992z"/>
</svg>`;

const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 18 6-6-6-6"/></svg>';

function renderNavLink(item, activeKey) {
  const active = item.key === activeKey ? ' is-active' : '';
  const badge = item.badge
    ? `<span class="nav-badge ${item.badge.kind}">${item.badge.text}</span>`
    : '';
  const external = /^https?:\/\//.test(item.href) ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `
    <a class="nav-link${active}" href="${item.href}"${external}>
      <svg viewBox="0 0 24 24">${item.icon}</svg>
      <span>${item.text}</span>
      ${badge}
    </a>`;
}

function renderNavGroup(item, activeKey) {
  const open = item.children.some((c) => c.key === activeKey) ? ' is-open' : '';
  const submenu = item.children
    .map((c) => `<a href="${c.href}">${c.text}</a>`)
    .join('');
  return `
    <div class="nav-item-group${open}" data-nav-group>
      <a class="nav-link" href="javascript:void(0)" data-nav-toggle>
        <svg viewBox="0 0 24 24">${item.icon}</svg>
        <span>${item.text}</span>
        ${CHEV}
      </a>
      <div class="nav-submenu">${submenu}</div>
    </div>`;
}

function renderSection(section, activeKey) {
  const items = section.items.map((item) => (
    item.children ? renderNavGroup(item, activeKey) : renderNavLink(item, activeKey)
  )).join('');
  return `
    <nav class="nav-section">
      <div class="nav-label">${section.label}</div>
      ${items}
    </nav>`;
}

function renderSidebar(activeKey) {
  const sections = NAV.map((s) => renderSection(s, activeKey)).join('');
  return `
    <aside class="d-sidebar">
      <div class="brand">
        <div class="brand-logo">${BRAND_LOGO}</div>
        <div class="brand-text">
          <div class="brand-name">Adminator</div>
          <div class="brand-tag">Internal collaboration</div>
        </div>
      </div>
      ${sections}
      <div class="sidebar-footer">
        <div class="workspace">
          <div class="workspace-avatar">JD</div>
          <div class="workspace-text">
            <div class="workspace-name">John Doe</div>
            <div class="workspace-role">admin</div>
          </div>
          <svg class="workspace-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="m7 9 5-5 5 5"/><path d="m7 15 5 5 5-5"/>
          </svg>
        </div>
      </div>
    </aside>`;
}

function renderCrumbs(crumbsAttr) {
  if (!crumbsAttr) return '';
  const parts = crumbsAttr.split('|').map((p) => p.trim()).filter(Boolean);
  const sep = '<svg class="sep" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>';
  return parts.map((p, i) => {
    const cls = i === parts.length - 1 ? ' class="current"' : '';
    return `${i > 0 ? sep : ''}<span${cls}>${p}</span>`;
  }).join('');
}

function renderTopbar(crumbsAttr) {
  return `
    <header class="d-topbar">
      <div class="crumbs">
        <button class="hamburger" data-drawer-open aria-label="Open navigation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        ${renderCrumbs(crumbsAttr)}
      </div>
      <div class="topbar-actions">
        <a class="btn btn--ghost" href="search.html">Search work</a><a class="btn btn--ghost" href="compose.html">New mail</a><button class="cmd" data-palette-open>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <span>Go to page...</span>
          <kbd class="kbd">⌘K</kbd>
        </button>

        <div class="dd-wrap">
          <button class="icon-btn" data-dropdown aria-label="Notifications">
            <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span class="count danger">3</span>
          </button>
          <div class="dd-menu" role="menu">
            <div class="dd-head">
              <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              Notifications
            </div>
            <div class="dd-list">
              <a class="dd-item" href="#">
                <div class="dd-avatar a1">JD</div>
                <div class="dd-body">
                  <div class="dd-text"><strong>John Doe</strong> liked your <em>post</em></div>
                  <div class="dd-time">5 MIN AGO</div>
                </div>
              </a>
              <a class="dd-item" href="#">
                <div class="dd-avatar a2">MD</div>
                <div class="dd-body">
                  <div class="dd-text"><strong>Moo Doe</strong> liked your <em>cover image</em></div>
                  <div class="dd-time">7 MIN AGO</div>
                </div>
              </a>
              <a class="dd-item" href="#">
                <div class="dd-avatar a3">LD</div>
                <div class="dd-body">
                  <div class="dd-text"><strong>Lee Doe</strong> commented on your <em>video</em></div>
                  <div class="dd-time">10 MIN AGO</div>
                </div>
              </a>
            </div>
            <a class="dd-footer" href="#">View all notifications →</a>
          </div>
        </div>

        <div class="dd-wrap">
          <button class="icon-btn" data-dropdown aria-label="Messages">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
            <span class="count info">3</span>
          </button>
          <div class="dd-menu" role="menu">
            <div class="dd-head">
              <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
              Messages
            </div>
            <div class="dd-list">
              <a class="dd-item" href="#">
                <div class="dd-avatar a1">JD</div>
                <div class="dd-body">
                  <div class="dd-row-head"><strong>John Doe</strong><span class="dd-time">5 MIN</span></div>
                  <div class="dd-preview">Want to create your own customized data generator for your app…</div>
                </div>
              </a>
              <a class="dd-item" href="#">
                <div class="dd-avatar a2">MD</div>
                <div class="dd-body">
                  <div class="dd-row-head"><strong>Moo Doe</strong><span class="dd-time">15 MIN</span></div>
                  <div class="dd-preview">Want to create your own customized data generator for your app…</div>
                </div>
              </a>
              <a class="dd-item" href="#">
                <div class="dd-avatar a3">LD</div>
                <div class="dd-body">
                  <div class="dd-row-head"><strong>Lee Doe</strong><span class="dd-time">25 MIN</span></div>
                  <div class="dd-preview">Want to create your own customized data generator for your app…</div>
                </div>
              </a>
            </div>
            <a class="dd-footer" href="#">View all messages →</a>
          </div>
        </div>

        <button class="icon-btn" id="themeToggle" aria-label="Toggle theme"></button>

        <div class="dd-wrap">
          <div class="avatar" data-dropdown tabindex="0" role="button" aria-label="Account menu">JD</div>
          <div class="dd-menu dd-profile" role="menu">
            <div class="dd-profile-head">
              <div class="dd-profile-name">John Doe</div>
              <div class="dd-profile-email">john@adminator.app</div>
            </div>
            <a class="dd-menu-item" href="settings.html">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Settings
            </a>
            <a class="dd-menu-item" href="settings.html">
              <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Profile
            </a>
            <a class="dd-menu-item" href="email.html">
              <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
              Messages
            </a>
            <div class="dd-divider"></div>
            <a class="dd-menu-item danger" href="#" data-auth-logout data-testid="account-menu-logout">
              <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              Logout
            </a>
          </div>
        </div>
      </div>
    </header>`;
}

function renderFooter() {
  return `
    <footer class="d-footer">
      <div>© 2026 · Designed by <a href="https://colorlib.com" target="_blank" rel="nofollow noopener noreferrer">Colorlib</a></div>
      <div class="d-footer-meta">
        <span>v4.3.0</span>
        <span>preview build</span>
      </div>
    </footer>`;
}

function mountShell() {
  const body = document.body;
  const activeKey = body.getAttribute('data-active') || '';
  const crumbs = body.getAttribute('data-crumbs') || '';

  const sidebarHost = document.querySelector('[data-shell-sidebar]');
  const topbarHost  = document.querySelector('[data-shell-topbar]');
  const footerHost  = document.querySelector('[data-shell-footer]');

  if (sidebarHost) sidebarHost.outerHTML = renderSidebar(activeKey);
  if (topbarHost)  topbarHost.outerHTML  = renderTopbar(crumbs);
  if (footerHost)  footerHost.outerHTML  = renderFooter();
}

;// ./assets/scripts/2026/init.js
/**
 * 2026 Shell behaviors:
 *  - theme toggle (icon swap + persistence)
 *  - dropdown open/close
 *  - sidebar nav-group expand/collapse
 *  - hero date population
 *  - todo checkbox state
 *
 * The early-paint <script> in each page body sets the initial data-theme
 * attribute to avoid a flash; this module only handles runtime toggles.
 */

const STORE_KEY = 'dash26-theme';

const SUN_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function initThemeToggle() {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;

  const update = () => {
    toggle.innerHTML = root.getAttribute('data-theme') === 'dark' ? SUN_ICON : MOON_ICON;
  };
  update();

  toggle.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(STORE_KEY, next); } catch { /* localStorage may be unavailable */ }
    update();
  });
}

function initHeroDate() {
  const el = document.getElementById('heroDate');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date());
  const parts = fmt.replace(/,/g, '').split(' ');
  el.textContent = `${parts[0]} · ${parts[1]} ${parts[2]} · ${parts[3]}`;
}

function initNavGroups() {
  // Rail mode (sidebar collapsed to 72px) renders the submenu as a flyout,
  // so only one should be open at a time and outside-clicks should dismiss it.
  // The flyout is position:fixed (see _responsive.scss) — we position it here
  // via getBoundingClientRect so it survives a scrolling sidebar and clamps to
  // the viewport bottom on short screens (e.g. 750×590).
  const railMQ = window.matchMedia('(min-width: 721px) and (max-width: 1100px)');

  const positionFlyout = (group) => {
    const trigger = group.querySelector('[data-nav-toggle]');
    const submenu = group.querySelector('.nav-submenu');
    if (!trigger || !submenu) return;
    const r = trigger.getBoundingClientRect();
    const h = submenu.offsetHeight;            // natural content height (max-height: 400 clamp)
    let top = Math.round(r.top);
    const maxTop = window.innerHeight - h - 8;
    if (top > maxTop) top = Math.max(8, maxTop);
    submenu.style.left = `${Math.round(r.right + 10)}px`;
    submenu.style.top = `${top}px`;
  };

  document.querySelectorAll('[data-nav-toggle]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const group = a.closest('[data-nav-group]');
      if (!group) return;
      e.stopPropagation();
      const willOpen = !group.classList.contains('is-open');
      if (railMQ.matches) {
        document.querySelectorAll('[data-nav-group].is-open').forEach((g) => {
          if (g !== group) g.classList.remove('is-open');
        });
      }
      group.classList.toggle('is-open', willOpen);
      if (willOpen && railMQ.matches) positionFlyout(group);
    });
  });

  document.addEventListener('click', (e) => {
    if (!railMQ.matches) return;
    if (e.target.closest('[data-nav-group]')) return;
    document.querySelectorAll('[data-nav-group].is-open').forEach((g) => g.classList.remove('is-open'));
  });

  // Keep the open flyout pinned to its trigger when the sidebar scrolls or the viewport resizes.
  const reposition = () => {
    if (!railMQ.matches) return;
    document.querySelectorAll('[data-nav-group].is-open').forEach(positionFlyout);
  };
  const sidebar = document.querySelector('.d-sidebar');
  if (sidebar) sidebar.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition);
}

function initDropdowns() {
  const closeAll = (except) => {
    document.querySelectorAll('.dd-wrap.is-open').forEach((w) => {
      if (w !== except) w.classList.remove('is-open');
    });
  };

  document.querySelectorAll('[data-dropdown]').forEach((trigger) => {
    const wrap = trigger.closest('.dd-wrap');
    if (!wrap) return;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !wrap.classList.contains('is-open');
      closeAll(wrap);
      wrap.classList.toggle('is-open', willOpen);
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dd-wrap')) closeAll();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
}

function initTodos() {
  document.querySelectorAll('.todo-check').forEach((cb) => {
    cb.addEventListener('change', () => {
      const item = cb.closest('.todo-item');
      if (item) item.classList.toggle('is-done', cb.checked);
    });
  });
}

function initAccordions() {
  document.querySelectorAll('[data-accordion-trigger]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('[data-accordion]');
      if (item) item.classList.toggle('is-open');
    });
  });
}

function initTabGroups() {
  // Tabs that opt in by sharing a [data-tab-group] container.
  // Each .tab inside gets click → toggles is-active on siblings and
  // matches a sibling .tab-panel by data-tab-target.
  document.querySelectorAll('[data-tab-group]').forEach((group) => {
    const tabs = group.querySelectorAll('.tab');
    const panels = group.querySelectorAll('.tab-panel');
    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const target = tab.getAttribute('data-tab-target');
        tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        panels.forEach((p) => p.classList.toggle('is-active', p.getAttribute('data-tab-id') === target));
      });
    });
  });
}

function initMobileDrawer() {
  // Mobile: hamburger button (rendered in topbar at ≤720px) opens an off-canvas
  // sidebar drawer. Closes on backdrop click, Esc, or selecting a nav link.
  const body = document.body;
  if (!body) return;

  // Inject a backdrop element once (used by CSS via body.has-drawer-open).
  if (!document.querySelector('.drawer-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    body.appendChild(backdrop);
    backdrop.addEventListener('click', closeDrawer);
  }

  function openDrawer() {
    body.classList.add('has-drawer-open');
  }
  function closeDrawer() {
    body.classList.remove('has-drawer-open');
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-drawer-open]');
    if (trigger) { e.preventDefault(); openDrawer(); return; }
    // Auto-close when a sidebar nav link is selected (so the next page opens cleanly).
    const linkInDrawer = e.target.closest('.d-sidebar a[href]:not([href^="#"]):not([href="javascript:void(0)"])');
    if (body.classList.contains('has-drawer-open') && linkInDrawer) {
      closeDrawer();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && body.classList.contains('has-drawer-open')) closeDrawer();
  });
}

function initShellBehaviors() {
  initThemeToggle();
  initHeroDate();
  initNavGroups();
  initDropdowns();
  initTodos();
  initAccordions();
  initTabGroups();
  initMobileDrawer();
}

;// ./assets/scripts/2026/charts.js
/**
 * Chart.js wiring for the 2026 design system.
 *
 * Pages declare charts as <canvas data-chart-key="<seed>"></canvas>.
 * This module reads CSS variables for theme colors so charts match the active
 * theme, instantiates a Chart.js instance, and re-renders on theme toggle.
 *
 * To keep the chart-page demo visually rich, the seeds are baked-in samples
 * keyed by data-chart-key.
 *
 * Chart.js (~192 KB) is loaded with a dynamic import() so only the two pages
 * that actually draw charts pay for it. initCharts() bails before the import
 * when the page has no [data-chart-key] canvas.
 */

let Chart = null;

async function loadChartJs() {
  if (Chart) return Chart;
  const mod = await __webpack_require__.e(/* import() | vendor-chartjs */ 311).then(__webpack_require__.bind(__webpack_require__, 420));
  Chart = mod.Chart;
  Chart.register(...mod.registerables);
  return Chart;
}

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  return {
    primary: cs.getPropertyValue('--primary').trim(),
    success: cs.getPropertyValue('--success').trim(),
    danger:  cs.getPropertyValue('--danger').trim(),
    warning: cs.getPropertyValue('--warning').trim(),
    info:    cs.getPropertyValue('--info').trim(),
    purple:  cs.getPropertyValue('--purple').trim(),
    pink:    cs.getPropertyValue('--pink').trim(),
    orange:  cs.getPropertyValue('--orange').trim(),
    teal:    cs.getPropertyValue('--teal').trim(),
    text:    cs.getPropertyValue('--t-base').trim(),
    muted:   cs.getPropertyValue('--t-muted').trim(),
    light:   cs.getPropertyValue('--t-light').trim(),
    border:  cs.getPropertyValue('--border').trim(),
    soft:    cs.getPropertyValue('--border-soft').trim(),
    bg:      cs.getPropertyValue('--bg-card').trim(),
  };
}

function applyDefaults(t) {
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = t.muted;
  Chart.defaults.borderColor = t.soft;
  Chart.defaults.plugins.legend.position = 'bottom';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
  Chart.defaults.plugins.tooltip.backgroundColor = t.text;
  Chart.defaults.plugins.tooltip.titleColor = t.bg;
  Chart.defaults.plugins.tooltip.bodyColor = t.bg;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 6;
  Chart.defaults.plugins.tooltip.displayColors = false;
}

const SEEDS = {
  'revenue-line': (t) => ({
    type: 'line',
    data: {
      labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      datasets: [
        {
          label: '2026',
          data: [42, 56, 50, 78, 88, 96, 110, 124, 118, 142, 158, 184],
          borderColor: t.primary,
          backgroundColor: `${t.primary}20`,
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          borderWidth: 2.5,
        },
        {
          label: '2025',
          data: [38, 44, 46, 60, 70, 74, 82, 90, 92, 102, 110, 118],
          borderColor: t.muted,
          backgroundColor: 'transparent',
          tension: 0.35,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 5,
          borderWidth: 2,
          borderDash: [4, 4],
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { grid: { color: t.soft, drawBorder: false }, ticks: { color: t.light } },
        x: { grid: { display: false }, ticks: { color: t.light } },
      },
    },
  }),

  'channels-bar': (t) => ({
    type: 'bar',
    data: {
      labels: ['Direct','Search','Social','Email','Affiliate','Display','Other'],
      datasets: [{
        label: 'Visitors',
        data: [124, 88, 72, 54, 36, 28, 18],
        backgroundColor: [t.primary, t.success, t.purple, t.info, t.warning, t.pink, t.muted],
        borderRadius: 6, borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: t.soft, drawBorder: false }, ticks: { color: t.light } },
        x: { grid: { display: false }, ticks: { color: t.muted } },
      },
    },
  }),

  'devices-doughnut': (t) => ({
    type: 'doughnut',
    data: {
      labels: ['Desktop','Mobile','Tablet'],
      datasets: [{
        data: [62, 30, 8],
        backgroundColor: [t.primary, t.purple, t.info],
        borderColor: t.bg,
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '68%',
      plugins: { legend: { position: 'right' } },
    },
  }),

  'sources-radar': (t) => ({
    type: 'radar',
    data: {
      labels: ['Speed','UX','Reliability','Pricing','Support','Features'],
      datasets: [
        {
          label: 'Adminator',
          data: [85, 92, 88, 76, 80, 95],
          borderColor: t.primary,
          backgroundColor: `${t.primary}30`,
          pointBackgroundColor: t.primary,
        },
        {
          label: 'Competitor',
          data: [70, 65, 75, 82, 60, 70],
          borderColor: t.muted,
          backgroundColor: `${t.muted}20`,
          pointBackgroundColor: t.muted,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: { angleLines: { color: t.soft }, grid: { color: t.soft }, pointLabels: { color: t.muted, font: { size: 11 } }, ticks: { display: false } },
      },
    },
  }),

  'mrr-stacked': (t) => ({
    type: 'bar',
    data: {
      labels: ['Q1','Q2','Q3','Q4'],
      datasets: [
        { label: 'Starter', data: [12, 18, 22, 28], backgroundColor: t.info,    borderRadius: 4, stack: 'a' },
        { label: 'Pro',     data: [38, 48, 56, 64], backgroundColor: t.primary, borderRadius: 4, stack: 'a' },
        { label: 'Team',    data: [22, 28, 36, 44], backgroundColor: t.purple,  borderRadius: 4, stack: 'a' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { stacked: true, grid: { color: t.soft, drawBorder: false }, ticks: { color: t.light } },
        x: { stacked: true, grid: { display: false }, ticks: { color: t.muted } },
      },
    },
  }),

  'dashboard-monthly': (t) => ({
    type: 'line',
    data: {
      labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      datasets: [{
        label: 'Revenue',
        data: [42, 38, 56, 50, 78, 70, 96, 88, 118, 102, 144, 168],
        borderColor: t.primary,
        backgroundColor: `${t.primary}24`,
        tension: 0.4,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: t.primary,
        pointHoverBorderColor: t.bg,
        pointHoverBorderWidth: 3,
        borderWidth: 2.5,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: t.soft, drawBorder: false }, ticks: { color: t.light, maxTicksLimit: 4 } },
        x: { grid: { display: false }, ticks: { color: t.light, font: { size: 10 } } },
      },
    },
  }),

  'sessions-area': (t) => ({
    type: 'line',
    data: {
      labels: Array.from({length: 30}, (_, i) => `${i + 1}`),
      datasets: [{
        label: 'Sessions',
        data: [120, 132, 110, 145, 162, 158, 175, 188, 172, 195, 210, 224, 218, 240, 256, 248, 272, 290, 282, 308, 322, 318, 340, 358, 352, 376, 392, 388, 410, 432],
        borderColor: t.success,
        backgroundColor: `${t.success}24`,
        tension: 0.4,
        fill: true,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: t.soft, drawBorder: false }, ticks: { color: t.light } },
        x: { grid: { display: false }, ticks: { color: t.light, maxTicksLimit: 6 } },
      },
    },
  }),
};

const instances = new Map();

async function buildAll() {
  await loadChartJs();
  const t = tokens();
  applyDefaults(t);
  document.querySelectorAll('canvas[data-chart-key]').forEach((canvas) => {
    const key = canvas.getAttribute('data-chart-key');
    const seed = SEEDS[key];
    if (!seed) return;
    const existing = instances.get(canvas);
    if (existing) existing.destroy();
    const values = canvas.dataset.chartValues ? JSON.parse(canvas.dataset.chartValues) : null;
    const config = values ? { type: 'bar', data: { labels: values.days, datasets: [['Events created','eventsCreated',t.primary],['Messages sent','messagesSent',t.success],['Internal mail sent','mailSent',t.info]].map(([label,key,color]) => ({ label, data: values[key], backgroundColor: color })) }, options: { responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } } } } : seed(t);
    instances.set(canvas, new Chart(canvas, config));
  });
}

function initCharts() {
  if (!document.querySelector('canvas[data-chart-key]')) return;
  buildAll();
  // Re-render charts whenever the theme changes.
  const observer = new MutationObserver((records) => {
    if (records.some((r) => r.attributeName === 'data-theme')) buildAll();
  });
  observer.observe(document.documentElement, { attributes: true });
}

;// ./assets/scripts/2026/maps.js
/**
 * jsvectormap wiring for the 2026 design system.
 *
 * Pages declare a vector map as <div data-vmap></div>; this module fills it
 * with a world map themed using the active CSS variables and re-renders on
 * theme change.
 *
 * jsvectormap plus its world map data is loaded with a dynamic import() so
 * only vector-maps.html pays for it — initVectorMaps() bails before the
 * import when the page has no [data-vmap] host.
 */

let jsVectorMap = null;

async function loadVectorMap() {
  if (jsVectorMap) return jsVectorMap;
  const mod = await __webpack_require__.e(/* import() | vendor-jsvectormap */ 280).then(__webpack_require__.bind(__webpack_require__, 168));
  jsVectorMap = mod.default;
  return jsVectorMap;
}

const MARKERS = [
  { name: 'Riga',         coords: [56.95, 24.10] },
  { name: 'New York',     coords: [40.71, -74.00] },
  { name: 'San Francisco',coords: [37.77, -122.42] },
  { name: 'London',       coords: [51.50, -0.12] },
  { name: 'Berlin',       coords: [52.52, 13.40] },
  { name: 'Tokyo',        coords: [35.68, 139.69] },
  { name: 'Sydney',       coords: [-33.86, 151.21] },
  { name: 'São Paulo',    coords: [-23.55, -46.63] },
  { name: 'Cape Town',    coords: [-33.92, 18.42] },
  { name: 'Dubai',        coords: [25.27, 55.30] },
];

const maps_instances = new Map();

function maps_tokens() {
  const cs = getComputedStyle(document.documentElement);
  return {
    primary: cs.getPropertyValue('--primary').trim(),
    purple:  cs.getPropertyValue('--purple').trim(),
    soft:    cs.getPropertyValue('--bg-muted').trim(),
    border:  cs.getPropertyValue('--border').trim(),
    text:    cs.getPropertyValue('--t-base').trim(),
    bg:      cs.getPropertyValue('--bg-card').trim(),
  };
}

async function buildOne(host) {
  await loadVectorMap();
  // Destroy old instance if rebuilding
  const prev = maps_instances.get(host);
  if (prev) {
    try { prev.destroy(); } catch { /* swallow — host is about to be replaced */ }
    host.innerHTML = '';
  }
  const t = maps_tokens();
  const map = new jsVectorMap({
    selector: host,
    map: 'world',
    backgroundColor: 'transparent',
    zoomOnScroll: false,
    regionStyle: {
      initial: { fill: t.soft, stroke: t.border, strokeWidth: 0.4, fillOpacity: 1 },
      hover:   { fill: t.primary, fillOpacity: 0.5 },
    },
    markers: MARKERS,
    markerStyle: {
      initial: { fill: t.primary, stroke: t.bg, strokeWidth: 2, r: 5 },
      hover:   { fill: t.purple,  stroke: t.bg, strokeWidth: 2, r: 7 },
    },
    labels: { markers: { render: (m) => m.name } },
  });
  maps_instances.set(host, map);
}

function maps_buildAll() {
  document.querySelectorAll('[data-vmap]').forEach(buildOne);
}

function initVectorMaps() {
  if (!document.querySelector('[data-vmap]')) return;
  maps_buildAll();
  const observer = new MutationObserver((records) => {
    if (records.some((r) => r.attributeName === 'data-theme')) maps_buildAll();
  });
  observer.observe(document.documentElement, { attributes: true });
}

;// ./assets/scripts/2026/workspace/resources.js


class ResourceCalendar {
  constructor(client, legacy) { this.client = client; this.legacy = legacy; this.ready = false; this.events = []; this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'; }
  async list() {
    this.events = (await this.client.request('/api/calendar/events')).events;
    return this.events;
  }
  async occurrences() { await this.list(); return (await this.client.request('/api/calendar/events?expand=true')).events; }
  save(data) {
    const valid = validateEvent(data);
    const keys = ['title','description','start','end','allDay','category','timezone','recurrence','location','attendeeIds'];
    const body = Object.fromEntries(keys.filter(key => valid[key] !== undefined).map(key => [key, valid[key]]));
    body.timezone ||= this.timezone;
    const old = this.events.find(event => event.id === data.id);
    if (data.id) body.expectedRevision = data.revision ?? old?.revision;
    return this.client.request(`/api/calendar/events${data.id ? `/${encodeURIComponent(data.id)}` : ''}`, { method: data.id ? 'PATCH' : 'POST', body });
  }
  remove(id) { const old = this.events.find(event => event.id === id); return this.client.request(`/api/calendar/events/${encodeURIComponent(id)}?revision=${old?.revision}`, { method: 'DELETE' }); }
  async reset() { await this.legacy.reset(); await this.client.request('/api/calendar/import', { method: 'POST', body: { timezone: this.timezone } }); return this.client.request('/api/calendar/samples/reset', { method: 'POST' }); }
  searchUsers(q) { return this.client.request(`/api/users/search?q=${encodeURIComponent(q)}`); }
  respond(id, status) { return this.client.request(`/api/calendar/events/${encodeURIComponent(id)}/response`, { method: 'POST', body: { status } }); }
}

class LiveChat {
  constructor(client, user) { this.client = client; this.store = { user }; this.rooms = []; this.messages = new Map(); this.pending = null; this.closed = false; this.onchange = () => {}; this.onstatus = () => {}; this.retry = 1000; }
  async list() {
    this.rooms = (await this.client.request('/api/chat/rooms')).rooms;
    for (const room of this.rooms) if (this.messages.has(room.id)) room.messages = this.messages.get(room.id);
    return this.rooms;
  }
  unread(room) { return room.unread; }
  async history(id) {
    const messages = []; let after = 0; let more = true;
    while (more) { const result = await this.client.request(`/api/chat/rooms/${encodeURIComponent(id)}/messages?after=${after}&limit=200`); messages.push(...result.messages); after = result.nextAfter; more = result.hasMore; }
    this.messages.set(id, messages); return messages;
  }
  async read(id) { const messages = await this.history(id); return this.client.request(`/api/chat/rooms/${encodeURIComponent(id)}/read`, { method: 'POST', body: { sequence: messages.at(-1)?.sequence || 0 } }); }
  async send(id, body) {
    // Retain the same retry ID after a network failure or lost acknowledgement.
    if (!this.pending || this.pending.id !== id || this.pending.body !== body) this.pending = { id, body, clientId: crypto.randomUUID() };
    const message = await this.client.request(`/api/chat/rooms/${encodeURIComponent(id)}/messages`, { method: 'POST', body: { body, clientId: this.pending.clientId } });
    this.pending = null; await this.history(id); return message;
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

;// ./assets/scripts/2026/workspace/services.js


const CATEGORIES = ['personal', 'work', 'team', 'travel', 'finance', 'birthday', 'holiday'];
function dateOnly(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function addDays(date, days) { const result = new Date(date); result.setDate(result.getDate() + days); return result; }
function eventDate(value) { return new Date(value.length === 10 ? `${value}T00:00` : value); }
function calendarSeed(now = new Date()) {
  const day = dateOnly(now); const tomorrow = dateOnly(addDays(now, 1));
  return { events: [
    { id: 'sample-meeting', title: 'Sample · planning meeting', description: 'Editable test fixture', start: `${day}T10:00`, end: `${day}T11:00`, allDay: false, category: 'work' },
    { id: 'sample-overlap', title: 'Sample · overlapping review', description: 'Tests overlapping time ranges', start: `${day}T10:30`, end: `${day}T11:30`, allDay: false, category: 'team' },
    { id: 'sample-day', title: 'Sample · all-day reminder', description: '', start: tomorrow, end: dateOnly(addDays(now, 2)), allDay: true, category: 'personal' },
    { id: 'sample-trip', title: 'Sample · multi-day workshop', description: 'End is exclusive', start: dateOnly(addDays(now, 2)), end: dateOnly(addDays(now, 5)), allDay: true, category: 'travel' },
    { id: 'sample-long', title: 'Sample · a long event title for testing wrapping and detailed event presentation on small screens', description: '', start: `${tomorrow}T14:00`, end: `${tomorrow}T15:00`, allDay: false, category: 'work' },
  ] };
}
function validateEvent(data) {
  if (!data.title?.trim() || data.title.trim().length > 200) throw Error('Title must contain 1–200 characters.');
  if ((data.description || '').length > 4000) throw Error('Description must be at most 4000 characters.');
  const pattern = data.allDay ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  if (!pattern.test(data.start) || !pattern.test(data.end) || !Number.isFinite(Date.parse(data.start)) || !Number.isFinite(Date.parse(data.end)) || Date.parse(data.end) <= Date.parse(data.start)) throw Error('End must be after the start.');
  if (!CATEGORIES.includes(data.category)) throw Error('Choose a valid category.');
  return { ...data, title: data.title.trim(), description: data.description || '', allDay: Boolean(data.allDay) };
}
class CalendarService {
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
function chatSeed(user, now = new Date()) {
  return { rooms: ['Sample design room', 'Sample planning room', 'Private notes'].map((name, index) => ({ id: `room-${index + 1}`, name, participantIds: [user.id, ...(index < 2 ? [`fixture-${index}`] : [])], lastReadAt: index === 0 ? now.toISOString() : null, messages: index < 2 ? [{ id: `fixture-message-${index}`, roomId: `room-${index + 1}`, senderId: `fixture-${index}`, senderName: 'Sample participant', body: 'This is a test fixture. Messages you send are saved only to your account, not delivered to another user.', sentAt: now.toISOString(), delivery: 'fixture' }] : [] })) };
}
class ChatService {
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
function workspaceServices(auth) {
  const calendar = new CalendarService(new WorkspaceStore(auth.client, auth.user, 'calendar', calendarSeed));
  const chat = new ChatService(new WorkspaceStore(auth.client, auth.user, 'chat', () => chatSeed(auth.user)));
  const tasks = new WorkspaceStore(auth.client, auth.user, 'tasks', () => ({ tasks: [] }));
  return { calendar: new ResourceCalendar(auth.client, calendar), chat, liveChat: new LiveChat(auth.client, auth.user), client: auth.client, tasks };
}

;// ./assets/scripts/2026/calendar.js




/** FullCalendar renders only; CalendarService validates and persists every mutation. */
async function initCalendarPage(service) {
  const host = document.querySelector('[data-fc]'); if (!host || !service) return;
  let attendees = []; let attendeeGeneration = 0;
  const status = document.createElement('p'); status.className = 'workspace-status'; status.setAttribute('role', 'status'); status.dataset.testid = 'calendar-status'; host.before(status); status.textContent = 'Loading calendar…';
  let scope = service.preferences?.state.calendarScope || 'all';
  const related = item => scope === 'all' || (scope === 'owned' ? item.ownerId === service.user.id : scope === 'invited' ? item.attendees?.some(a => a.userId === service.user.id) : item.ownerId === service.user.id || item.attendees?.some(a => a.userId === service.user.id && a.status !== 'declined'));
  let calendar; let events = []; let editing = null; let busy = false; let filter = ''; let query = ''; let expanded = [];
  const dialog = document.createElement('dialog'); dialog.className = 'workspace-dialog'; dialog.dataset.testid = 'event-dialog'; dialog.setAttribute('aria-labelledby', 'event-dialog-title');
  dialog.innerHTML = `<form novalidate><h2 id="event-dialog-title">Event details</h2><label>Title<input name="title" maxlength="200" data-testid="event-title" required></label><label>Description<textarea name="description" maxlength="4000" data-testid="event-description"></textarea></label><label class="workspace-check"><input name="allDay" type="checkbox" data-testid="event-all-day">All-day event</label><label>Start<input name="start" type="datetime-local" data-testid="event-start" required></label><label><span data-end-label>End</span><input name="end" type="datetime-local" data-testid="event-end" required></label><label>Category<select name="category" data-testid="event-category">${CATEGORIES.map(category => `<option value="${category}">${category}</option>`).join('')}</select></label><label>Location<input name="location" maxlength="300" data-testid="event-location"></label><label>IANA timezone<input name="timezone" data-testid="event-timezone" required></label><label>Repeat<select name="frequency" data-testid="event-repeat"><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label>Repeat interval<input name="interval" type="number" min="1" max="30" value="1"></label><label>Occurrences (1–366)<input name="count" data-testid="event-repeat-count" type="number" min="1" max="366" value="10"></label><p data-sharing-note></p><p>Editing or deleting a recurring event applies to the entire series.</p><button type="button" class="btn" data-event-task>Create follow-up task</button><div data-conflict></div><label>Find attendees<input name="attendeeSearch" data-testid="event-attendee-search" type="search"></label><div data-testid="event-attendees"></div><div data-testid="event-response"></div><p role="alert" data-testid="event-error"></p><div class="workspace-actions"><button type="button" class="btn" data-testid="event-cancel">Cancel</button><button type="button" class="btn" data-testid="event-delete">Delete event</button><button class="btn btn--primary" data-testid="event-save">Save event</button></div></form>`;
  document.body.append(dialog); const form = dialog.querySelector('form'); const fields = form.elements;
  fields.allDay.addEventListener('change', () => {
    for (const key of ['start', 'end']) { const old = fields[key].value; fields[key].type = fields.allDay.checked ? 'date' : 'datetime-local'; fields[key].value = fields.allDay.checked ? old.slice(0, 10) : `${old.slice(0, 10)}T${key === 'start' ? '09:00' : '10:00'}`; }
    dialog.querySelector('[data-end-label]').textContent = fields.allDay.checked ? 'Last day (inclusive)' : 'End';
  });
  function open(event = null, start = new Date(), end = null, allDay = false) {
    editing = event; form.reset(); dialog.querySelector('[data-conflict]').replaceChildren(); dialog.querySelector('[data-sharing-note]').textContent = event ? (event.shared ? 'Shared: all signed-in users can view and edit this event.' : 'Private: only the owner and invited members can view this event.') : 'New events are shared with all signed-in users. Attendee selection does not make an event private.'; dialog.querySelector('[data-event-task]').hidden = !event; window.dispatchEvent(new CustomEvent('adminator-form-saved', {detail:form})); attendees = event?.attendees?.map(a => ({ id: a.userId, displayName: a.displayName, status: a.status })) || []; renderAttendees(); dialog.querySelector('[role="alert"]').textContent = '';
    fields.title.value = event?.title || ''; fields.description.value = event?.description || ''; fields.allDay.checked = event?.allDay ?? allDay; fields.category.value = event?.category || 'work';
    fields.timezone.value = event?.timezone || service.timezone; fields.location.value = event?.location || ''; fields.frequency.value = event?.recurrence?.frequency || ''; fields.interval.value = event?.recurrence?.interval || 1; fields.count.value = event?.recurrence?.count || 10;
    const day = dateOnly(start); const from = event?.start || (allDay ? day : end ? localDate(start, false) : `${day}T09:00`); const to = event?.end || (allDay ? dateOnly(end || addDays(start, 1)) : end ? localDate(end, false) : `${day}T10:00`);
    for (const key of ['start', 'end']) fields[key].type = fields.allDay.checked ? 'date' : 'datetime-local';
    fields.start.value = fields.allDay.checked ? from.slice(0, 10) : wallTime(from, fields.timezone.value); fields.end.value = fields.allDay.checked ? dateOnly(addDays(new Date(`${to.slice(0, 10)}T12:00`), -1)) : wallTime(to, fields.timezone.value);
    dialog.querySelector('[data-end-label]').textContent = fields.allDay.checked ? 'Last day (inclusive)' : 'End'; dialog.querySelector('[data-testid="event-delete"]').hidden = !event; dialog.querySelectorAll('input,select,textarea').forEach(control => { control.disabled = event?.canEdit === false; }); dialog.querySelector('[data-testid="event-save"]').hidden = event?.canEdit === false; dialog.querySelector('[data-testid="event-delete"]').hidden = !event || event.canEdit === false; const response = dialog.querySelector('[data-testid="event-response"]'); response.innerHTML = event?.attendees?.some(a => a.userId === service.user?.id) ? '<button type="button" class="btn" data-rsvp="accepted">Accept invitation</button><button type="button" class="btn" data-rsvp="declined">Decline invitation</button>' : ''; response.querySelectorAll('[data-rsvp]').forEach(button => { button.onclick = () => operation(() => service.respond(event.id, button.dataset.rsvp), 'Invitation response saved.'); }); dialog.showModal(); fields.title.focus();
  }
  function wallTime(value, zone) { if (!/[Z+]|-\d{2}:\d{2}$/.test(value.slice(10))) return value.slice(0,16); const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date(value)); return parts.replace(' ', 'T'); }
  function renderAttendees() { const box = dialog.querySelector('[data-testid="event-attendees"]'); box.innerHTML = attendees.map(a => `<div>${escapeHtml(a.displayName)} · ${escapeHtml(a.status || 'pending')} <button type="button" class="btn" data-remove-attendee="${escapeHtml(a.id)}">Remove</button></div>`).join(''); box.querySelectorAll('button').forEach(button => { button.hidden = editing?.canEdit === false; button.onclick = () => { attendees = attendees.filter(a => a.id !== button.dataset.removeAttendee); renderAttendees(); }; }); }
  const results = document.createElement('div'); fields.attendeeSearch.after(results);
  fields.attendeeSearch.oninput = async () => { const generation = ++attendeeGeneration; results.innerHTML = ''; if (fields.attendeeSearch.value.trim().length < 2) return; try { const { users } = await service.searchUsers(fields.attendeeSearch.value); if (generation !== attendeeGeneration) return; results.innerHTML = users.filter(u => !attendees.some(a => a.id === u.id)).map(u => `<button type="button" class="btn" data-add-attendee="${escapeHtml(u.id)}">${escapeHtml(u.displayName)} (${escapeHtml(u.username)})</button>`).join(''); results.querySelectorAll('button').forEach(button => { button.onclick = () => { attendees.push(users.find(u => u.id === button.dataset.addAttendee)); renderAttendees(); results.innerHTML = ''; fields.attendeeSearch.value = ''; }; }); } catch(error) { dialog.querySelector('[role="alert"]').textContent = error.message; } };
  dialog.querySelector('[data-event-task]').onclick = () => createTask(service.hub, editing.title, {kind:'calendar',id:editing.id});
  dialog.querySelector('[data-testid="event-cancel"]').onclick = () => dialog.close(); dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  async function operation(action, message) {
    if (busy) return; busy = true; status.textContent = 'Saving…'; dialog.querySelectorAll('button, input, select, textarea').forEach(control => { control.disabled = true; });
    try { await action(); await refresh(); status.textContent = message; window.dispatchEvent(new CustomEvent('adminator-form-saved', {detail:form})); if (dialog.open) dialog.close(); }
    catch (error) { status.textContent = error.message; dialog.querySelector('[role="alert"]').textContent = error.message; if (error.status === 409) { await refresh(); if (editing) { const latest = events.find(item => item.id === editing.id); if (latest) { const box = dialog.querySelector('[data-conflict]'); box.innerHTML = `<h3>Another person changed this event</h3><p>Latest: ${escapeHtml(latest.title)} · ${escapeHtml(latest.start)} → ${escapeHtml(latest.end)} · revision ${latest.revision}</p><p>Your unsaved form remains above. Reload the latest version before editing again.</p><button class="btn" type="button">Load latest version</button>`; box.querySelector('button').onclick = () => { dialog.close(); open(latest); }; } else { dialog.querySelector('[role="alert"]').textContent = 'This event was deleted. Your unsaved input remains; close and create a new event if needed.'; } } } }
    finally { busy = false; dialog.querySelectorAll('button, input, select, textarea').forEach(control => { control.disabled = false; }); }
  }
  form.onsubmit = event => { event.preventDefault(); const data = { ...(editing ? { id: editing.id } : {}), title: fields.title.value, description: fields.description.value, allDay: fields.allDay.checked, start: fields.start.value, end: fields.end.value, category: fields.category.value, timezone: fields.timezone.value, location: fields.location.value, attendeeIds: attendees.map(a => a.id), recurrence: fields.frequency.value ? { frequency: fields.frequency.value, interval: Number(fields.interval.value), count: Number(fields.count.value) } : null, ...(editing ? { revision: editing.revision } : {}) }; if (data.allDay && data.end) data.end = dateOnly(addDays(new Date(`${data.end}T12:00`), 1)); operation(() => service.save(data), 'Event saved.'); };
  dialog.querySelector('[data-testid="event-delete"]').onclick = () => operation(() => service.remove(editing.id), 'Event deleted.');
  function updateRail() {
    const date = calendar.getDate(); const title = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); document.querySelector('.cal-month').textContent = title; document.querySelector('.cal-hero .hero-title').textContent = title;
    document.querySelector('.cal-hero .hero-sub').textContent = `${events.length} saved events · Server calendar · Shared calendar for all authenticated users. Legacy personal events remain private.`;
    const rail = document.querySelector('.cal-rail'); const first = new Date(date.getFullYear(), date.getMonth(), 1); const gridStart = addDays(first, -first.getDay());
    const upcoming = expanded.filter(related).filter(item => eventDate(item.end) > new Date()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);
    rail.innerHTML = `<button class="cal-quickadd" data-testid="calendar-quick-add">Quick add event</button><div class="cal-rail-card"><div class="cal-rail-head"><span class="cal-rail-title">${escapeHtml(title)}</span><button class="btn" aria-label="Previous mini calendar month" data-mini-prev>‹</button><button class="btn" aria-label="Next mini calendar month" data-mini-next>›</button></div><div class="mini-cal-grid">${['S','M','T','W','T','F','S'].map(day => `<span class="mini-cal-wd">${day}</span>`).join('')}${Array.from({ length: 42 }, (_, index) => { const day = addDays(gridStart, index); return `<button class="mini-cal-day" data-day="${dateOnly(day)}" aria-label="Add event on ${dateOnly(day)}">${day.getDate()}</button>`; }).join('')}</div></div><div class="cal-rail-card"><label>Search events<input type="search" data-testid="calendar-search" value="${escapeHtml(query)}"></label></div><div class="cal-rail-card"><label>Event scope<select data-calendar-scope>${['all','related','owned','invited'].map(value => `<option value="${value}" ${scope === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><h2 class="cal-rail-title">Calendars</h2><label>Filter category<select data-testid="calendar-filter"><option value="">All categories</option>${CATEGORIES.map(category => `<option value="${category}" ${category === filter ? 'selected' : ''}>${category} (${events.filter(item => item.category === category).length})</option>`).join('')}</select></label></div><div class="cal-rail-card"><h2 class="cal-rail-title">Upcoming</h2>${upcoming.map(item => `<button class="workspace-upcoming" data-event-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}<small>${escapeHtml(item.allDay ? item.start : new Date(item.start).toLocaleString())}</small></button>`).join('') || '<p>No upcoming events.</p>'}<button class="btn" data-agenda>See all events</button></div>`;
    rail.querySelector('[data-calendar-scope]').onchange = e => { scope = e.target.value; renderEvents(); updateRail(); };
    rail.querySelector('[data-testid="calendar-quick-add"]').onclick = () => open(); rail.querySelector('[data-mini-prev]').onclick = () => calendar.prev(); rail.querySelector('[data-mini-next]').onclick = () => calendar.next();
    rail.querySelectorAll('[data-day]').forEach(button => { button.onclick = () => open(null, new Date(`${button.dataset.day}T12:00`), null, true); }); rail.querySelectorAll('[data-event-id]').forEach(button => { button.onclick = () => open(events.find(item => item.id === button.dataset.eventId)); }); rail.querySelector('[data-agenda]').onclick = () => changeView('Agenda'); rail.querySelector('[data-testid="calendar-search"]').oninput = e => { query = e.target.value; renderEvents(); }; rail.querySelector('select').onchange = event => { filter = event.target.value; renderEvents(); };
  }
  function renderEvents() { calendar.removeAllEvents(); calendar.addEventSource(expanded.filter(related).filter(item => (!filter || item.category === filter) && `${item.title} ${item.description} ${item.location || ''}`.toLowerCase().includes(query.toLowerCase())).map(item => ({ ...item, id: `${item.id}::${item.occurrence}`, editable: item.canEdit && !item.recurrence, className: `fc-cat-${item.category}`, extendedProps: { seriesId: item.id, description: item.description, category: item.category } }))); }
  async function refresh() { events = await service.list(); expanded = await service.occurrences(); renderEvents(); updateRail(); }
  function changeView(label) { calendar.changeView({ Day: 'timeGridDay', Week: 'timeGridWeek', Month: 'dayGridMonth', Agenda: 'listWeek' }[label]); document.querySelectorAll('.cal-view-tab').forEach(button => { button.classList.toggle('is-active', button.textContent.trim() === label); button.setAttribute('aria-pressed', String(button.textContent.trim() === label)); }); }
  function localDate(date, allDay) { return allDay ? dateOnly(date) : `${dateOnly(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
  async function move(info) { const original = events.find(item => item.id === info.event.extendedProps.seriesId); try { status.textContent = 'Saving event position…'; await service.save({ ...original, allDay: info.event.allDay, start: localDate(info.event.start, info.event.allDay), end: localDate(info.event.end || addDays(info.event.start, 1), info.event.allDay), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, attendeeIds: original.attendees.map(a => a.userId) }); await refresh(); status.textContent = 'Event updated.'; } catch (error) { info.revert(); status.textContent = error.message; } }
  try {
    events = await service.list(); const mod = await __webpack_require__.e(/* import() | vendor-fullcalendar */ 707).then(__webpack_require__.bind(__webpack_require__, 890)); calendar = new mod.Calendar(host, { plugins: mod.plugins, initialView: 'dayGridMonth', headerToolbar: false, height: '100%', expandRows: true, dayMaxEvents: 3, fixedWeekCount: false, nowIndicator: true, selectable: true, editable: true, eventDisplay: 'block', datesSet: () => { if (calendar) updateRail(); }, dateClick: info => open(null, info.date, info.allDay ? null : new Date(info.date.getTime() + 3600000), info.allDay), select: info => { open(null, info.start, info.end, info.allDay); calendar.unselect(); }, eventClick: info => open(events.find(item => item.id === info.event.extendedProps.seriesId)), eventDrop: move, eventResize: move, dayCellDidMount: info => { info.el.dataset.testid = 'calendar-day'; info.el.dataset.date = dateOnly(info.date); }, eventDidMount: info => { info.el.dataset.testid = 'calendar-event'; info.el.dataset.eventId = info.event.id; info.el.setAttribute('aria-label', `Event: ${info.event.title}`); }, dayHeaderContent: arg => ({ html: `<span class="fc-dow">${escapeHtml(arg.text)}</span>` }) }); calendar.render(); await refresh(); status.textContent = 'Calendar ready.'; const params = new URLSearchParams(location.search); if (params.get('event')) { const target = events.find(e => e.id === params.get('event')); if (target) { calendar.gotoDate(target.start); open(target); } else status.textContent = 'Event unavailable or access changed. Your calendar remains available.'; } else if (params.get('new')) open(); if (params.get('view') === 'agenda') changeView('Agenda');
    document.querySelectorAll('button').forEach(button => { const label = button.textContent.trim(); if (label === 'New event') { button.dataset.testid = button.closest('.cal-toolbar') ? 'calendar-add' : 'calendar-hero-add'; button.onclick = () => open(); } if (label === 'Export') { button.dataset.testid = 'calendar-export'; button.onclick = () => exportJson('calendar.json', events); } });
    document.querySelector('.cal-main [aria-label="Previous"]').onclick = () => calendar.prev(); document.querySelector('.cal-main [aria-label="Next"]').onclick = () => calendar.next(); document.querySelector('.cal-today-btn').onclick = () => calendar.today(); document.querySelectorAll('.cal-view-tab').forEach(button => { button.onclick = () => changeView(button.textContent.trim()); }); document.querySelector('[aria-label="Filter"]').onclick = () => document.querySelector('[data-testid="calendar-filter"]').focus();
    const reset = document.createElement('button'); reset.className = 'btn'; reset.textContent = 'Reset my private calendar samples'; reset.dataset.testid = 'calendar-reset'; reset.onclick = () => operation(() => service.reset(), 'Private sample events restored for this account.'); status.before(reset);
    let syncing = false;
    const timer = setInterval(async () => {
      if (busy || syncing || dialog.open || document.hidden) return;
      syncing = true;
      try { await refresh(); } catch (error) { status.textContent = error.message; } finally { syncing = false; }
    }, 3000);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
    window.addEventListener('adminator-account-changing', () => clearInterval(timer), { once: true });
  } catch (error) { status.textContent = error.message; const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = 'Retry calendar'; retry.onclick = () => location.reload(); status.after(retry); }
}

;// ./assets/scripts/2026/palette.js
/**
 * Command palette (⌘K / Ctrl+K).
 *
 * Builds a searchable modal of every NAV item plus a few global actions
 * (toggle theme, view docs/repo). Opens via:
 *   - Click on any [data-palette-open] element (the topbar .cmd button)
 *   - Cmd/Ctrl + K keyboard shortcut, anywhere on the page
 *   - "/" keypress when no input is focused
 *
 * Closes via:
 *   - Esc
 *   - Click outside the panel
 *   - Selecting a result (Enter or click)
 *
 * Keyboard navigation: ↑ / ↓ to move, Enter to select.
 *
 * The palette renders into <body> the first time it's opened, then re-uses
 * that DOM node. All state is local to this module.
 */



const PANEL_HTML = `
  <div class="palette-modal" role="dialog" aria-modal="true" aria-label="Command palette">
    <div class="palette-input-row">
      <svg viewBox="0 0 24 24" class="palette-icon" aria-hidden="true">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="m21 21-4.3-4.3" fill="none" stroke="currentColor" stroke-width="2"/>
      </svg>
      <input class="palette-input" type="text" placeholder="Search pages, actions…" autocomplete="off" spellcheck="false">
      <kbd class="palette-esc">esc</kbd>
    </div>
    <div class="palette-results" role="listbox"></div>
    <div class="palette-foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
      <span><kbd>↵</kbd> select</span>
      <span><kbd>esc</kbd> close</span>
    </div>
  </div>
`;

let backdrop = null;
let modal = null;
let input = null;
let resultsEl = null;
let allItems = [];
let filtered = [];
let cursor = 0;

function buildItems() {
  // Flatten the NAV manifest into a single list of selectable rows.
  const items = [];

  for (const section of NAV) {
    for (const item of section.items) {
      if (item.children) {
        for (const child of item.children) {
          items.push({
            kind: 'page',
            label: child.text,
            section: `${section.label} › ${item.text}`,
            href: child.href,
            icon: item.icon,
          });
        }
      } else if (item.href && item.href !== '#') {
        items.push({
          kind: 'page',
          label: item.text,
          section: section.label,
          href: item.href,
          icon: item.icon,
        });
      }
    }
  }

  // Static actions
  items.push({
    kind: 'action',
    label: 'Toggle theme (light / dark)',
    section: 'Action',
    action: () => {
      const root = document.documentElement;
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('dash26-theme', next); } catch { /* no localStorage */ }
      // Update the toggle button icon if init.js wired one.
      const toggle = document.getElementById('themeToggle');
      if (toggle) toggle.click(); // no-op if already in the right state, or just nudge it
    },
    icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  });
  items.push({
    kind: 'link',
    label: 'View on GitHub',
    section: 'External',
    href: 'https://github.com/puikinsh/Adminator-admin-dashboard',
    target: '_blank',
    icon: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
  });
  items.push({
    kind: 'link',
    label: 'Documentation',
    section: 'External',
    href: 'https://puikinsh.github.io/Adminator-admin-dashboard/',
    target: '_blank',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  });

  return items;
}

function score(item, query) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const label = item.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 50;
  if (label.includes(q)) return 20;
  if (item.section.toLowerCase().includes(q)) return 5;
  return 0;
}

function renderResults() {
  resultsEl.innerHTML = filtered.length === 0
    ? '<div class="palette-empty">No results</div>'
    : filtered.map((item, i) => `
      <div class="palette-result${i === cursor ? ' is-selected' : ''}" role="option" data-index="${i}" aria-selected="${i === cursor}">
        <span class="palette-result-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">${item.icon || ''}</svg></span>
        <span class="palette-result-label">${item.label}</span>
        <span class="palette-result-section">${item.section}</span>
      </div>
    `).join('');
}

function update(query) {
  filtered = allItems
    .map((item) => ({ item, s: score(item, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((x) => x.item);
  cursor = 0;
  renderResults();
}

function activate(item) {
  if (!item) return;
  palette_close();
  if (item.kind === 'action' && typeof item.action === 'function') {
    item.action();
  } else if (item.href) {
    if (item.target === '_blank') {
      window.open(item.href, '_blank', 'noopener');
    } else {
      window.location.href = item.href;
    }
  }
}

function ensureMounted() {
  // If the cached modal was removed from the DOM (e.g. by a test or by code
  // that wipes <body>), drop the stale refs and remount.
  if (modal && !document.contains(modal)) {
    modal = null; backdrop = null; input = null; resultsEl = null;
  }
  if (modal) return;
  backdrop = document.createElement('div');
  backdrop.className = 'palette-backdrop';
  backdrop.innerHTML = PANEL_HTML;
  document.body.appendChild(backdrop);
  modal = backdrop.querySelector('.palette-modal');
  input = backdrop.querySelector('.palette-input');
  resultsEl = backdrop.querySelector('.palette-results');

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) palette_close();
  });
  input.addEventListener('input', () => update(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(cursor + 1, filtered.length - 1);
      renderResults();
      scrollCursorIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(cursor - 1, 0);
      renderResults();
      scrollCursorIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(filtered[cursor]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      palette_close();
    }
  });
  resultsEl.addEventListener('click', (e) => {
    const row = e.target.closest('.palette-result');
    if (row) activate(filtered[Number(row.getAttribute('data-index'))]);
  });
}

function scrollCursorIntoView() {
  const sel = resultsEl.querySelector('.palette-result.is-selected');
  if (sel && typeof sel.scrollIntoView === 'function') {
    sel.scrollIntoView({ block: 'nearest' });
  }
}

function palette_open() {
  ensureMounted();
  if (allItems.length === 0) allItems = buildItems();
  input.value = '';
  update('');
  document.body.classList.add('has-palette-open');
  // Focus on next tick (jsdom-friendly).
  setTimeout(() => input.focus(), 0);
}

function palette_close() {
  if (!modal) return;
  document.body.classList.remove('has-palette-open');
}

function isOpen() {
  return document.body.classList.contains('has-palette-open');
}

let _initialized = false;

function initPalette() {
  // Guard against being called twice (e.g. when init runs on both
  // DOMContentLoaded and on a manual re-init after hot reload). Without
  // this, every keydown handler runs N times, which causes Cmd+K to net-no-op
  // on the second invocation.
  if (_initialized) return;
  _initialized = true;

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-palette-open]')) {
      e.preventDefault();
      palette_open();
    }
  });

  document.addEventListener('keydown', (e) => {
    // Cmd+K (Mac) / Ctrl+K (Windows/Linux): open from anywhere
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      isOpen() ? palette_close() : palette_open();
      return;
    }
    // Slash: open when no input is focused
    if (e.key === '/' && !isOpen()) {
      const tag = document.activeElement && document.activeElement.tagName;
      const editable = document.activeElement && document.activeElement.isContentEditable;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !editable) {
        e.preventDefault();
        palette_open();
      }
    }
  });
}

;// ./assets/scripts/2026/email/model.js
/**
 * @typedef {{name: string, address: string}} MailAddress
 * @typedef {{id: string, name: string, size: number, type: string, available: boolean}} Attachment
 * @typedef {Object} Email
 * @property {string} id
 * @property {string} accountId
 * @property {?string} messageId
 * @property {string} threadId
 * @property {MailAddress} from
 * @property {MailAddress[]} to
 * @property {MailAddress[]} cc
 * @property {MailAddress[]} bcc
 * @property {string} subject
 * @property {string} bodyText
 * @property {string} bodyHtml
 * @property {?string} receivedAt
 * @property {?string} sentAt
 * @property {string} updatedAt
 * @property {boolean} isRead
 * @property {boolean} isStarred
 * @property {string} folderId
 * @property {string[]} labels
 * @property {Attachment[]} attachments
 * @property {?string} inReplyTo
 * @property {string[]} references
 * @property {'primary'|'updates'|'promotions'} category
 * @property {'received'|'draft'|'queued'|'sent'|'failed'|'mock-sent'} deliveryStatus
 */

class EmailError extends Error {
  constructor(code, message) { super(message); this.name = 'EmailError'; this.code = code; }
}
const SELF = { name: 'John Doe', address: 'john@adminator.app' };
const FOLDERS = ['inbox', 'starred', 'snoozed', 'sent', 'drafts', 'spam', 'trash', 'archive'];
const LABELS = ['Work', 'Team', 'Finance', 'Invoices', 'Travel'];
const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;
const ATTACHMENT_TYPES = ['text/plain', 'text/csv', 'application/pdf', 'image/png', 'image/jpeg', 'image/gif'];
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Convert API data at the boundary. REST deployments may inject a different mapper. */
function normalizeEmail(data) {
  return {
    id: data.id, accountId: data.accountId, messageId: null, threadId: data.id,
    from: SELF, to: [], cc: [], bcc: [], subject: '', bodyText: '', bodyHtml: '',
    receivedAt: null, sentAt: null, updatedAt: new Date().toISOString(),
    isRead: false, isStarred: false, folderId: 'inbox', labels: [], attachments: [],
    inReplyTo: null, references: [], category: 'primary', deliveryStatus: 'received', ...clone(data),
  };
}

function parseAddresses(value) {
  return String(value || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    .map((address) => ({ name: '', address }));
}

function validateMessage(data, sending = false) {
  for (const field of ['to', 'cc', 'bcc']) {
    if (!Array.isArray(data[field])) throw new EmailError('VALIDATION', `${field} must be an address list.`);
    for (const person of data[field]) {
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(person.address)) {
        throw new EmailError('VALIDATION', `Invalid ${field} address: ${person.address}`);
      }
    }
  }
  if (sending && !data.to.length) throw new EmailError('VALIDATION', 'Enter at least one To recipient.');
  if (sending && !data.subject.trim()) throw new EmailError('VALIDATION', 'Enter a subject.');
  if (sending && !data.bodyText.trim()) throw new EmailError('VALIDATION', 'Enter a message.');
}

function matchesFolder(email, folder) {
  return folder === 'starred'
    ? email.isStarred && !['trash', 'spam', 'drafts'].includes(email.folderId)
    : email.folderId === folder;
}

/** Server-side implementations accept the same query, returning a page envelope. */
function queryEmails(emails, query = {}) {
  const text = String(query.query || '').toLowerCase();
  const filtered = emails.filter((mail) => {
    const haystack = [mail.from.name, mail.from.address, ...mail.to.map((p) => p.address),
      ...mail.cc.map((p) => p.address), ...mail.bcc.map((p) => p.address), mail.subject, mail.bodyText].join(' ').toLowerCase();
    return (!query.folderId || matchesFolder(mail, query.folderId)) && (!text || haystack.includes(text))
      && (!query.label || mail.labels.includes(query.label))
      && (!query.category || mail.category === query.category)
      && (query.read === undefined || mail.isRead === query.read)
      && (!query.starred || mail.isStarred);
  });
  filtered.sort((a, b) => {
    const diff = Date.parse(b.sentAt || b.receivedAt || b.updatedAt) - Date.parse(a.sentAt || a.receivedAt || a.updatedAt);
    return (query.sort === 'oldest' ? -diff : diff) || a.id.localeCompare(b.id);
  });
  const offset = Math.max(0, Number(query.offset) || 0);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 25));
  return { items: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit };
}

;// ./assets/scripts/2026/email/internal-api.js

class InternalEmailApi {
  constructor({ authClient }) { this.client = authClient; }
  request(path, options) { return this.client.request(`/api/mail${path}`, options); }
  async all() { return (await this.request('/emails')).items; }
  async getEmails(query = {}) { return queryEmails(await this.all(), query); }
  searchEmails(query) { return this.getEmails(typeof query === 'string' ? { query } : query); }
  getEmailById(id) { return this.request(`/emails/${encodeURIComponent(id)}`); }
  async getThread(id) { return (await this.all()).filter(mail => mail.threadId === id && !['trash','spam'].includes(mail.folderId)); }
  async sendEmail(body) {
    const fingerprint = JSON.stringify(body);
    if (this.pending?.fingerprint !== fingerprint) this.pending = { fingerprint, clientId: crypto.randomUUID() };
    const result = await this.request('/send', { method: 'POST', body: { ...body, clientId: this.pending.clientId } });
    this.pending = null; return result;
  }
  saveDraft(body) { return this.request('/drafts', { method: 'POST', body }); }
  updateDraft(id, body) { return this.saveDraft({ ...body, id }); }
  patch(id, body) { return this.request(`/emails/${encodeURIComponent(id)}`, { method: 'PATCH', body }); }
  deleteEmail(id) { return this.moveEmail(id, 'trash'); }
  moveEmail(id, folderId) { return this.patch(id, { folderId }); }
  markAsRead(id) { return this.patch(id, { isRead: true }); }
  markAsUnread(id) { return this.patch(id, { isRead: false }); }
  toggleStar(id) { return this.request(`/emails/${encodeURIComponent(id)}/star`, { method: 'POST' }); }
  updateLabels(id, labels) { return this.patch(id, { labels }); }
  async getFolders() { const mails = await this.all(); return FOLDERS.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), total: mails.filter(m => matchesFolder(m,id)).length, unread: mails.filter(m => matchesFolder(m,id) && !m.isRead).length })); }
  async getLabels() { return LABELS.map(id => ({ id, name: id })); }
  async getAttachments() { return []; }
  uploadAttachment() { return Promise.reject(new EmailError('CONFIG', 'Attachments are available in mock mode only. Internal delivery currently supports text.')); }
  downloadAttachment() { return Promise.reject(new EmailError('CONFIG', 'No internal attachment exists.')); }
}

;// ./assets/scripts/2026/email/seed.js


/** Fresh, deterministic samples; no mutable fixture is shared with UI. */
function seedEmails(accountId, identity = SELF) {
  const samples = [
    ['Sara Kim', 'sara@northwind.example', 'Q2 launch plan — review before Thursday', 'Hey John, attaching the latest timeline. Please review the pricing before Thursday.', 'inbox', ['Work'], 'primary', true],
    ['Leo Reyes', 'leo@adminator.example', 'Dependency bump merged — all green', 'Morning! The dependency upgrade is merged and CI passed. Can you review the release notes?', 'inbox', ['Team', 'Work'], 'primary', false],
    ['Mira Doe', 'mira@northwind.example', 'Invoice #INV-2026-104 ready for approval', 'Your monthly invoice is ready. Total $4,820.00 due May 7.', 'inbox', ['Finance', 'Invoices'], 'updates', false],
    ['Anya Trent', 'anya@studio.example', 'Brand workshop notes', 'Thanks for sharing. I added comments on the secondary palette.', 'inbox', ['Work'], 'primary', false],
    ['Travel Desk', 'travel@example.com', 'Your itinerary is confirmed', 'Your Seoul trip is confirmed. Please check the departure time.', 'inbox', ['Travel'], 'updates', true],
    ['Studio Offers', 'offers@example.com', 'Spring design collection', 'Explore this month’s design collection and member offers.', 'inbox', [], 'promotions', false],
    ['Sara Kim', 'sara@northwind.example', 'Re: Q2 launch plan — review before Thursday', 'Following up: the timeline is now final. Let me know if anything needs updating.', 'inbox', ['Work'], 'primary', false],
    ['John Doe', SELF.address, 'Release checklist', 'Please review the release checklist.', 'sent', ['Team'], 'primary', false],
    ['John Doe', SELF.address, 'Draft: team meeting', 'Agenda for our next meeting.', 'drafts', ['Team'], 'primary', false],
    ['Support', 'support@example.com', 'Ticket follow-up', 'We will follow up next week.', 'snoozed', [], 'updates', false],
    ['Unknown', 'unknown@example.com', 'Sample spam', 'This sample is classified as spam.', 'spam', [], 'promotions', false],
    ['Newsletter', 'news@example.com', 'Old newsletter', 'A deleted newsletter sample.', 'trash', [], 'updates', false],
  ];
  return samples.map(([name, address, subject, bodyText, folderId, labels, category, isStarred], i) => normalizeEmail({
    id: `sample-${i + 1}`, accountId, messageId: `<sample-${i + 1}@mock.adminator>`,
    threadId: i === 6 ? 'sample-1' : `sample-${i + 1}`, from: address === SELF.address ? identity : { name, address },
    to: folderId === 'sent' || folderId === 'drafts' ? [{ name: 'Sara Kim', address: 'sara@northwind.example' }] : [identity],
    cc: i === 0 ? [{ name: 'Leo Reyes', address: 'leo@adminator.example' }] : [],
    subject, bodyText, folderId, labels, category, isStarred,
    receivedAt: new Date(Date.UTC(2026, 3, 23, 10 - i)).toISOString(),
    sentAt: folderId === 'sent' ? '2026-04-22T10:00:00.000Z' : null,
    isRead: i > 2, deliveryStatus: folderId === 'drafts' ? 'draft' : folderId === 'sent' ? 'mock-sent' : 'received',
    inReplyTo: i === 6 ? '<sample-1@mock.adminator>' : null,
    references: i === 6 ? ['<sample-1@mock.adminator>'] : [],
    attachments: i === 0 ? [{ id: 'sample-attachment', name: 'launch-plan.pdf', size: 245000, type: 'application/pdf', available: false }] : [],
  }));
}

;// ./assets/scripts/2026/email/mock-api.js



/** Async persistence boundary. Instances for different accounts/namespaces never share records. */
class MockEmailApi {
  constructor({ accountId = 'demo', namespace = 'default', storage, latency = 100, persistence = null, identity = SELF } = {}) {
    this.accountId = accountId;
    this.key = `adminator-email:v1:${encodeURIComponent(namespace)}:${encodeURIComponent(accountId)}`;
    this.storage = storage || (persistence ? null : globalThis.localStorage);
    this.persistence = persistence;
    this.identity = identity;
    this.latency = latency;
    this.failure = null;
    this.queue = Promise.resolve();
  }
  failNext(message = 'Simulated network failure') { this.failure = message; }
  async execute(operation) {
    const task = this.queue.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, this.latency));
      if (this.failure) { const message = this.failure; this.failure = null; throw new EmailError('NETWORK', message); }
      let state;
      try {
        const raw = this.persistence ? await this.persistence.load() : this.storage.getItem(this.key);
        state = raw ? this.persistence ? raw : JSON.parse(raw) : { version: 1, emails: seedEmails(this.accountId, this.identity), files: {} };
        if (state.version !== 1 || !Array.isArray(state.emails) || !state.files) throw Error('Invalid mailbox');
      } catch (error) {
        if (this.persistence) throw error;
        throw new EmailError('STORAGE', `Cannot read mailbox: ${error.message}. Use Reset mock data to recover.`);
      }
      const result = await operation(state);
      try { if (this.persistence) await this.persistence.save(state); else this.storage.setItem(this.key, JSON.stringify(state)); }
      catch (error) { if (this.persistence) throw error; throw new EmailError('STORAGE', 'Mailbox could not be saved. Browser storage is full or unavailable.'); }
      return clone(result);
    });
    this.queue = task.catch(() => {});
    return task;
  }
  find(state, id) {
    const mail = state.emails.find((item) => item.id === id && item.accountId === this.accountId);
    if (!mail) throw new EmailError('NOT_FOUND', 'Email not found.');
    return mail;
  }
  getEmails(query = {}) { return this.execute((state) => queryEmails(state.emails, query)); }
  searchEmails(query) { return this.getEmails(typeof query === 'string' ? { query } : query); }
  getEmailById(id) { return this.execute((state) => this.find(state, id)); }
  getThread(threadId) { return this.execute((state) => state.emails.filter((e) => e.threadId === threadId && !['trash', 'spam'].includes(e.folderId)).sort((a, b) => Date.parse(a.sentAt || a.receivedAt || a.updatedAt) - Date.parse(b.sentAt || b.receivedAt || b.updatedAt))); }
  mutate(id, changes) { return this.execute((state) => {
    const mail = this.find(state, id); Object.assign(mail, typeof changes === 'function' ? changes(mail) : changes, { updatedAt: new Date().toISOString() }); return mail;
  }); }
  deleteEmail(id) { return this.moveEmail(id, 'trash'); }
  moveEmail(id, folderId) {
    if (!FOLDERS.includes(folderId) || ['starred', 'drafts', 'sent'].includes(folderId)) return Promise.reject(new EmailError('VALIDATION', 'Invalid destination folder.'));
    return this.execute((state) => {
      const mail = this.find(state, id);
      if (mail.folderId === 'drafts' && folderId !== 'trash') throw new EmailError('VALIDATION', 'Save or send the draft before moving it.');
      mail.folderId = folderId; mail.updatedAt = new Date().toISOString(); return mail;
    });
  }
  markAsRead(id) { return this.mutate(id, { isRead: true }); }
  markAsUnread(id) { return this.mutate(id, { isRead: false }); }
  toggleStar(id) { return this.mutate(id, (mail) => ({ isStarred: !mail.isStarred })); }
  updateLabels(id, labels) {
    if (labels.some((label) => !LABELS.includes(label))) return Promise.reject(new EmailError('VALIDATION', 'Unknown label.'));
    return this.mutate(id, { labels: [...new Set(labels)] });
  }
  getFolders() { return this.execute((state) => FOLDERS.map((id) => {
    const mails = state.emails.filter((e) => matchesFolder(e, id));
    return { id, name: id[0].toUpperCase() + id.slice(1), virtual: id === 'starred', total: mails.length, unread: mails.filter((e) => !e.isRead).length };
  })); }
  getLabels() { return this.execute((state) => LABELS.map((name) => ({ id: name, name, total: state.emails.filter((e) => e.labels.includes(name)).length }))); }
  createMessage(state, data, folderId) {
    const id = globalThis.crypto.randomUUID();
    this.checkAttachments(state, data.attachments || []);
    const mail = normalizeEmail({ ...data, id, accountId: this.accountId, from: this.identity, folderId,
      threadId: data.threadId || id, messageId: folderId === 'sent' ? `<${id}@mock.adminator>` : null,
      isRead: true, deliveryStatus: folderId === 'sent' ? 'mock-sent' : 'draft',
      sentAt: folderId === 'sent' ? new Date().toISOString() : null, receivedAt: null });
    state.emails.push(mail); return mail;
  }
  checkAttachments(state, attachments) {
    for (const attachment of attachments) {
      if (attachment.available && !state.files[attachment.id]) throw new EmailError('NOT_FOUND', 'Attachment no longer available. Please upload it again.');
    }
  }
  sendEmail(data) { return this.execute((state) => {
    if (data.id) {
      const draft = this.find(state, data.id);
      if (draft.folderId !== 'drafts') throw new EmailError('CONFLICT', 'Only drafts can be sent again.');
      this.checkAttachments(state, data.attachments || []);
      Object.assign(draft, data, { folderId: 'sent', from: this.identity, sentAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deliveryStatus: 'mock-sent', isRead: true, messageId: `<${draft.id}@mock.adminator>` });
      return { email: draft, status: 'mock-sent', requestId: globalThis.crypto.randomUUID() };
    }
    return { email: this.createMessage(state, data, 'sent'), status: 'mock-sent', requestId: globalThis.crypto.randomUUID() };
  }); }
  saveDraft(data) { return this.execute((state) => this.createMessage(state, data, 'drafts')); }
  updateDraft(id, data) { return this.execute((state) => {
    const draft = this.find(state, id);
    if (draft.folderId !== 'drafts') throw new EmailError('CONFLICT', 'This message is no longer a draft.');
    this.checkAttachments(state, data.attachments || []);
    Object.assign(draft, data, { id, folderId: 'drafts', updatedAt: new Date().toISOString() }); return draft;
  }); }
  getAttachments(id) { return this.execute((state) => this.find(state, id).attachments); }
  async uploadAttachment(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new EmailError('UPLOAD', 'Could not read attachment.')); reader.readAsDataURL(file);
    });
    return this.execute((state) => {
      const attachment = { id: globalThis.crypto.randomUUID(), name: file.name, size: file.size, type: file.type, available: true };
      state.files[attachment.id] = { ...attachment, dataUrl }; return attachment;
    });
  }
  downloadAttachment(id) { return this.execute((state) => {
    const file = state.files[id];
    if (!file) throw new EmailError('NOT_FOUND', 'This sample attachment has no file content.');
    return file;
  }); }
  reset() {
    const task = this.queue.then(async () => {
      try { if (this.persistence) await this.persistence.reset(); else this.storage.removeItem(this.key); }
      catch (error) { if (this.persistence) throw error; throw new EmailError('STORAGE', 'Cannot reset mailbox storage.'); }
      this.failure = null; return { reset: true };
    });
    this.queue = task.catch(() => {}); return task;
  }
}

;// ./assets/scripts/2026/email/rest-api.js


/** Proposed REST contract; dormant unless explicitly selected with a baseUrl. */
class RestEmailApi {
  constructor({ baseUrl, accountId, fetchImpl = globalThis.fetch, mapEmail = normalizeEmail, headers = {}, authClient = null }) {
    if (!baseUrl || !accountId) throw new EmailError('CONFIG', 'REST mode requires baseUrl and accountId.');
    const url = new URL(baseUrl, globalThis.location?.href);
    if (!['http:', 'https:'].includes(url.protocol)) throw new EmailError('CONFIG', 'REST baseUrl must use HTTP(S).');
    this.baseUrl = `${url.href.replace(/\/$/, '')}/accounts/${encodeURIComponent(accountId)}`;
    this.fetch = fetchImpl.bind(globalThis); this.mapEmail = mapEmail; this.headers = headers; this.authClient = authClient;
  }
  async request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.fetch(this.baseUrl + path, {
        method, credentials: 'include', signal: controller.signal,
        headers: { ...this.headers, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' && this.authClient ? { 'X-CSRF-Token': this.authClient.csrfToken } : {}) },
        body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined,
      });
      if (!response.ok) { if (response.status === 401) this.authClient?.loseSession(); throw new EmailError(`HTTP_${response.status}`, `Email server returned ${response.status}.`); }
      return response.status === 204 ? null : await response.json();
    } catch (error) {
      if (error instanceof EmailError) throw error;
      throw new EmailError('NETWORK', error.name === 'AbortError' ? 'Email request timed out.' : 'Email server could not be reached.');
    } finally { clearTimeout(timer); }
  }
  async getEmails(query = {}) {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== ''));
    const result = await this.request(`/emails?${params}`);
    return { ...result, items: result.items.map(this.mapEmail) };
  }
  searchEmails(query) { return this.getEmails(typeof query === 'string' ? { query } : query); }
  async getEmailById(id) { return this.mapEmail(await this.request(`/emails/${encodeURIComponent(id)}`)); }
  async getThread(id) { return (await this.request(`/threads/${encodeURIComponent(id)}`)).map(this.mapEmail); }
  async sendEmail(data) {
    const result = await this.request('/send', { method: 'POST', body: data });
    return { ...result, email: this.mapEmail(result.email) };
  }
  async saveDraft(data) { return this.mapEmail(await this.request('/drafts', { method: 'POST', body: data })); }
  async updateDraft(id, data) { return this.mapEmail(await this.request(`/drafts/${encodeURIComponent(id)}`, { method: 'PATCH', body: data })); }
  async patch(id, body) { return this.mapEmail(await this.request(`/emails/${encodeURIComponent(id)}`, { method: 'PATCH', body })); }
  deleteEmail(id) { return this.moveEmail(id, 'trash'); }
  moveEmail(id, folderId) { return this.patch(id, { folderId }); }
  markAsRead(id) { return this.patch(id, { isRead: true }); }
  markAsUnread(id) { return this.patch(id, { isRead: false }); }
  async toggleStar(id) { return this.mapEmail(await this.request(`/emails/${encodeURIComponent(id)}/star`, { method: 'POST' })); }
  getFolders() { return this.request('/folders'); }
  getLabels() { return this.request('/labels'); }
  updateLabels(id, labels) { return this.patch(id, { labels }); }
  getAttachments(id) { return this.request(`/emails/${encodeURIComponent(id)}/attachments`); }
  uploadAttachment(file) { const body = new FormData(); body.append('file', file); return this.request('/attachments', { method: 'POST', body }); }
  async downloadAttachment(id) {
    // Backend returns a short-lived authorized download descriptor {name, type, dataUrl|url}.
    return this.request(`/attachments/${encodeURIComponent(id)}/download`);
  }
}

;// ./assets/scripts/2026/email/service.js





/**
 * @typedef {Object} EmailApi
 * @property {function(Object=): Promise<Object>} getEmails
 * @property {function(Object|string): Promise<Object>} searchEmails
 * @property {function(string): Promise<Object>} getEmailById
 * @property {function(string): Promise<Object[]>} getThread
 * @property {function(Object): Promise<Object>} sendEmail
 * @property {function(Object): Promise<Object>} saveDraft
 * @property {function(string,Object): Promise<Object>} updateDraft
 * @property {function(string): Promise<Object>} deleteEmail
 * @property {function(string,string): Promise<Object>} moveEmail
 * @property {function(string): Promise<Object>} markAsRead
 * @property {function(string): Promise<Object>} markAsUnread
 * @property {function(string): Promise<Object>} toggleStar
 * @property {function(): Promise<Object[]>} getFolders
 * @property {function(): Promise<Object[]>} getLabels
 * @property {function(string,string[]): Promise<Object>} updateLabels
 * @property {function(string): Promise<Object[]>} getAttachments
 * @property {function(File): Promise<Object>} uploadAttachment
 * @property {function(string): Promise<Object>} downloadAttachment
 */

/** All mailbox operations pass through this layer; UI has no persistence access. */
class EmailService {
  /** @param {EmailApi} api */
  constructor(api, { identity = SELF } = {}) { this.api = api; this.identity = identity; }
  getEmails(query) { return this.api.getEmails(query); }
  searchEmails(query) { return this.api.searchEmails(query); }
  getEmailById(id) { return this.api.getEmailById(id); }
  getThread(id) { return this.api.getThread(id); }
  getFolders() { return this.api.getFolders(); }
  getLabels() { return this.api.getLabels(); }
  deleteEmail(id) { return this.api.deleteEmail(id); }
  moveEmail(id, folder) { return this.api.moveEmail(id, folder); }
  markAsRead(id) { return this.api.markAsRead(id); }
  markAsUnread(id) { return this.api.markAsUnread(id); }
  toggleStar(id) { return this.api.toggleStar(id); }
  updateLabels(id, labels) { return this.api.updateLabels(id, labels); }
  getAttachments(id) { return this.api.getAttachments(id); }
  downloadAttachment(id) { return this.api.downloadAttachment(id); }
  message(input) {
    const data = {};
    for (const key of ['id', 'threadId', 'inReplyTo', 'references', 'attachments', 'category', 'labels']) {
      if (input[key] !== undefined) data[key] = input[key];
    }
    for (const key of ['to', 'cc', 'bcc']) data[key] = Array.isArray(input[key]) ? input[key] : parseAddresses(input[key]);
    data.subject = String(input.subject || ''); data.bodyText = String(input.bodyText || ''); data.bodyHtml = '';
    return data;
  }
  async sendEmail(input) { const data = this.message(input); validateMessage(data, true); return this.api.sendEmail(data); }
  async saveDraft(input) { const data = this.message(input); validateMessage(data); return data.id ? this.api.updateDraft(data.id, data) : this.api.saveDraft(data); }
  async updateDraft(id, input) { return this.saveDraft({ ...input, id }); }
  async uploadAttachment(file) {
    if (!file.size || file.size > MAX_ATTACHMENT_SIZE) throw new EmailError('VALIDATION', 'Attachment must be between 1 byte and 2 MB.');
    if (!ATTACHMENT_TYPES.includes(file.type)) throw new EmailError('VALIDATION', 'Supported attachments: TXT, CSV, PDF, PNG, JPEG, GIF.');
    return this.api.uploadAttachment(file);
  }
  async composeFrom(id, mode) {
    const email = await this.getEmailById(id);
    if (mode === 'draft') return email;
    const forward = mode === 'forward';
    const ownAddress = this.identity.address.toLowerCase();
    const dedupe = (people) => [...new Map(people.filter((p) => p.address.toLowerCase() !== ownAddress).map((p) => [p.address.toLowerCase(), p])).values()];
    const to = forward ? [] : dedupe(email.from.address.toLowerCase() === ownAddress ? email.to : [email.from]);
    const cc = mode === 'reply-all' ? dedupe([...email.to, ...email.cc]).filter((p) => !to.some((t) => t.address.toLowerCase() === p.address.toLowerCase())) : [];
    return {
      to, cc, bcc: [], subject: `${forward ? 'Fwd' : 'Re'}: ${email.subject.replace(/^(Re|Fwd):\s*/i, '')}`,
      bodyText: `\n\n${forward ? 'Forwarded message' : 'Original message'} from ${email.from.address}:\n${email.bodyText}`,
      threadId: forward ? undefined : email.threadId,
      inReplyTo: forward ? null : email.messageId,
      references: forward ? [] : [...new Set([...email.references, email.messageId].filter(Boolean))],
      attachments: forward ? await this.getAttachments(id) : [],
    };
  }
  reset() {
    if (!this.api.reset) return Promise.reject(new EmailError('CONFIG', 'Reset is only available in mock mode.'));
    return this.api.reset();
  }
  failNext() {
    if (!this.api.failNext) throw new EmailError('CONFIG', 'Failure simulation is only available in mock mode.');
    this.api.failNext();
  }
}

/** Configuration is optional; unset always means mock, with no fetch calls. */
function createEmailService(config = {}) {
  const mode = config.mode || 'mock';
  if (!['mock', 'rest', 'internal'].includes(mode)) throw new EmailError('CONFIG', 'Unknown email API mode.');
  return new EmailService(mode === 'internal' ? new InternalEmailApi(config) : mode === 'rest' ? new RestEmailApi(config) : new MockEmailApi(config), config);
}

;// ./assets/scripts/2026/email/ui.js



const ui_escape = (value = '') => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const starIcon = '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17.14 14.14 18.18 21.02 12 17.77 5.82 21.02 6.86 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const folderIcon = '<svg viewBox="0 0 24 24"><path d="M3 5h6l2 2h10v13H3z"/></svg>';
const ui_button = (action, text, extra = '') => `<button type="button" class="btn btn--ghost" data-action="${action}" data-testid="${action}" ${extra}>${text}</button>`;
const addresses = (people = []) => people.map((p) => p.address).join(', ');
const date = (value) => value ? new Date(value).toLocaleString() : 'Draft';
const size = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function composeMarkup() {
  return `<form data-testid="compose-form" novalidate>
    <div class="mail-compose-heading"><h2 id="compose-title">New message</h2>${ui_button('cancel-compose', 'Cancel')}</div>
    <p>From: <span data-compose-from></span></p>
    ${['to', 'cc', 'bcc', 'subject'].map((name) => `<label class="email-field">${name === 'to' ? 'To' : name === 'subject' ? 'Subject' : name.toUpperCase()}<input name="${name}" data-testid="compose-${name}" ${name === 'to' || name === 'subject' ? 'aria-required="true"' : ''} autocomplete="off" ${name !== 'subject' ? 'placeholder="name@example.com, other@example.com"' : ''}></label>`).join('')}
    <label class="email-field">Message<textarea name="bodyText" rows="10" aria-required="true" data-testid="compose-body"></textarea></label>
    <label class="email-field">Attach files (up to 2 MB each)<input type="file" name="files" multiple accept="text/plain,text/csv,application/pdf,image/png,image/jpeg,image/gif" data-testid="compose-files"></label>
    <div data-compose-attachments data-testid="compose-attachments"></div>
    <p role="alert" data-compose-error data-testid="compose-error"></p>
    <div class="mail-compose-heading">${ui_button('save-draft', 'Save draft')}<button class="btn btn--primary" type="submit" data-testid="send-email">Send</button></div>
  </form>`;
}

const controlsMarkup = `<label>Read status<select data-filter="read" data-testid="read-filter"><option value="">All</option><option value="false">Unread</option><option value="true">Read</option></select></label>
  <label>Starred<select data-filter="starred" data-testid="star-filter"><option value="">All</option><option value="true">Starred</option></select></label>
  <label>Label<select data-filter="label" data-testid="label-filter"><option value="">All labels</option></select></label>
  <label>Sort<select data-filter="sort" data-testid="sort-order"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>`;

/** Email and standalone Compose share one controller, service and form. */
async function initEmailPage({ service: injectedService, config: accountConfig } = {}) {
  const root = document.querySelector('[data-email-app]');
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = 'true';
  const standalone = document.body.dataset.active === 'compose';
  const config = accountConfig || globalThis.ADMINATOR_EMAIL_CONFIG || {};
  const mode = config.mode || 'mock';
  let service;
  try { service = injectedService || createEmailService(config); }
  catch (error) { root.textContent = error.message; root.setAttribute('role', 'alert'); return; }
  const state = { folderId: 'inbox', query: '', category: '', sort: 'newest', offset: 0, limit: 25, selected: null, labels: [], folders: [], page: { items: [], total: 0 }, busy: false, compose: null, attachments: [] };
  let disposed = false;
  root.innerHTML = `<section class="hero mail-hero"><div class="hero-text"><span class="eyebrow">Communications · ${mode === 'mock' ? 'Mock mailbox' : 'Connected mailbox'}</span><h1 class="hero-title" data-mail-title>${standalone ? 'Compose' : 'Inbox'}</h1><p class="hero-sub">${mode === 'mock' ? 'Mock mailbox. Sending saves to your Sent folder; no email is delivered to recipients.' : mode === 'internal' ? 'Internal account mail · Registered @adminator.test recipients only. Text messages are delivered to their database inbox.' : 'Manage your mailbox.'}</p></div><div class="hero-actions"><a class="btn" data-testid="email-mode" href="${standalone ? 'compose' : 'email'}.html${mode === 'internal' ? '?mailMode=mock' : '?mailMode=internal'}">${mode === 'internal' ? 'Preserved mock mailbox' : 'Real internal mailbox'}</a>${standalone ? `<a class="btn btn--ghost" href="email.html${mode === 'internal' ? '?mailMode=internal' : ''}">Back to Email</a>` : ui_button('refresh', 'Refresh') + ui_button('compose', 'Compose')}${mode === 'mock' ? ui_button('reset-mail', 'Reset mock data') + ui_button('fail-next', 'Simulate next error') : ''}</div></section>
    <p role="status" aria-live="polite" data-status data-testid="email-status"></p><p role="alert" data-error data-testid="email-error"></p>
    ${standalone ? `<section class="card email-compose-page">${composeMarkup()}</section>` : `<section class="mail-shell email-app" aria-label="Email" data-testid="mailbox"><aside class="mail-rail"><button class="mail-compose" data-action="compose" data-testid="rail-compose">Compose</button><div data-folders></div><div data-labels></div></aside><section class="mail-list"><div class="mail-list-head"><div class="mail-list-title" data-list-title></div><div class="mail-search"><input type="search" aria-label="Search mail" placeholder="Search sender, recipient, subject, body…" data-testid="search-mail"></div><div class="email-filters">${controlsMarkup}</div></div><div class="mail-tabs" data-testid="categories">${['', 'primary', 'updates', 'promotions'].map((category) => `<button class="mail-tab${!category ? ' is-active' : ''}" data-category="${category}" aria-pressed="${!category}" data-testid="category-${category || 'all'}">${category ? category[0].toUpperCase() + category.slice(1) : 'All'}</button>`).join('')}</div><div class="mail-list-scroll" data-message-list data-testid="email-list"></div><div class="email-pagination">${ui_button('previous-page', 'Previous')}<span data-page-info></span>${ui_button('next-page', 'Next')}</div></section><section class="mail-reader" data-reader data-testid="email-detail"><div class="reader-scroll">Select a message to read it.</div></section></section><dialog class="email-compose-dialog" aria-labelledby="compose-title" data-testid="compose-dialog">${composeMarkup()}</dialog>`}`;
  const $ = (selector) => root.querySelector(selector);
  const form = $('form');
  if (mode === 'internal') form.elements.files.closest('label').hidden = true;
  const dialog = $('dialog');
  const hub = config.hub;
  let recipientGeneration = 0;
  if (mode === 'internal' && hub) {
    const picker = document.createElement('div'); picker.innerHTML = '<label class="email-field">Find a member<input type="search" data-recipient-search aria-label="Find mail recipients"></label><label>Recipient field<select data-recipient-field><option value="to">To</option><option value="cc">Cc</option><option value="bcc">Bcc</option></select></label><div data-recipient-results></div>';
    form.elements.to.closest('label').before(picker);
    picker.querySelector('input').oninput = async () => { const generation = ++recipientGeneration; const q = picker.querySelector('input').value.trim(); picker.querySelector('[data-recipient-results]').replaceChildren(); if (q.length < 2) return;
      try { const r = await hub.client.request(`/api/directory?q=${encodeURIComponent(q)}&limit=8`); if (disposed || generation !== recipientGeneration) return; picker.querySelector('[data-recipient-results]').innerHTML = r.users.map(u => `<button type="button" class="btn" data-recipient-address="${ui_escape(u.emailAddress)}">${ui_escape(u.displayName)} · ${ui_escape(u.emailAddress)}</button>`).join('') || '<p>No members found.</p>'; picker.querySelectorAll('button').forEach(b => { b.onclick = () => { const field = form.elements[picker.querySelector('select').value]; const values = field.value.split(',').map(v=>v.trim()).filter(Boolean); if (!values.includes(b.dataset.recipientAddress)) values.push(b.dataset.recipientAddress); field.value = values.join(', '); field.dispatchEvent(new Event('input',{bubbles:true})); picker.querySelector('input').value=''; picker.querySelector('[data-recipient-results]').replaceChildren(); }; }); }
      catch (failure) { if (!disposed) $('[data-compose-error]').textContent = failure.message; }
    };
  }
  window.addEventListener('adminator-account-changing', () => {
    disposed = true; form.reset(); if (dialog?.open) dialog.close();
    Object.assign(state, { selected: null, compose: null, attachments: [], labels: [], folders: [], page: { items: [], total: 0 } });
  }, { once: true });
  const status = (message) => { if (!disposed) $('[data-status]').textContent = message; };
  const error = (message) => { if (!disposed) $('[data-error]').textContent = message; };
  $('[data-compose-from]').textContent = service.identity.address;
  let composeTrigger;
  let restoreComposeFocus = false;

  function setBusy(value) {
    if (disposed) return;
    state.busy = value;
    root.setAttribute('aria-busy', String(value));
    root.querySelectorAll('button, select, input, textarea').forEach((el) => { el.disabled = value; });
    if (!value && !standalone) {
      $('[data-action="previous-page"]').disabled = state.offset === 0;
      $('[data-action="next-page"]').disabled = state.offset + state.limit >= state.page.total;
    }
  }
  async function run(operation, message, loadingMessage = 'Loading…') {
    if (state.busy || disposed) return;
    error(''); $('[data-compose-error]').textContent = ''; setBusy(true); status(loadingMessage);
    try { await operation(); if (!disposed && $('[data-status]').textContent === loadingMessage) status(message || 'Ready'); }
    catch (failure) {
      if (disposed) return;
      error(failure.message); status('Operation failed');
      if (state.compose) $('[data-compose-error]').textContent = failure.message;
    } finally {
      if (!disposed) {
        setBusy(false);
        if (dialog?.open && !dialog.contains(document.activeElement)) form.elements.to.focus();
        if (restoreComposeFocus) { (composeTrigger?.isConnected ? composeTrigger : $('[data-action="compose"]'))?.focus(); restoreComposeFocus = false; }
      }
    }
  }
  function tags(mail) { return mail.labels.map((label) => `<span class="mail-tag ${ui_escape(label.toLowerCase())}">${ui_escape(label)}</span>`).join(''); }

  async function refresh() {
    if (standalone || disposed) return;
    const query = { folderId: state.folderId, query: state.query, category: state.category, sort: state.sort, offset: state.offset, limit: state.limit, label: state.label, starred: state.starred, read: state.read };
    const [page, folders, labels] = await Promise.all([service.searchEmails(query), service.getFolders(), service.getLabels()]);
    if (disposed) return;
    state.page = page; state.folders = folders; state.labels = labels;
    if (page.total && state.offset >= page.total) { state.offset = Math.max(0, Math.floor((page.total - 1) / state.limit) * state.limit); return refresh(); }
    const currentFolder = folders.find((f) => f.id === state.folderId);
    $('[data-mail-title]').textContent = `${currentFolder.name} · ${currentFolder.unread} unread`;
    $('[data-list-title]').textContent = `${currentFolder.name} · ${page.total} results`;
    $('[data-folders]').innerHTML = `<div class="mail-rail-label">Folders · total / unread</div>${  folders.map((folder) => `<button class="mail-folder${state.folderId === folder.id ? ' is-active' : ''}" data-folder="${ui_escape(folder.id)}" data-testid="folder-${ui_escape(folder.id)}" aria-pressed="${state.folderId === folder.id}">${folder.id === 'starred' ? starIcon : folderIcon}<span class="mail-folder-name">${ui_escape(folder.name)}</span><span class="mail-folder-count">${folder.total} / ${folder.unread}</span></button>`).join('')}`;
    $('[data-labels]').innerHTML = `<div class="mail-rail-label">Labels</div>${  labels.map((label) => `<button class="mail-folder" data-label="${ui_escape(label.id)}" data-testid="label-${ui_escape(label.id)}"><span class="mail-label-dot"></span><span class="mail-folder-name">${ui_escape(label.name)}</span><span class="mail-folder-count">${label.total}</span></button>`).join('')}`;
    $('[data-filter="label"]').innerHTML = `<option value="">All labels</option>${  labels.map((label) => `<option value="${ui_escape(label.id)}">${ui_escape(label.name)}</option>`).join('')}`;
    $('[data-filter="label"]').value = state.label || '';
    $('[data-message-list]').innerHTML = page.items.length ? page.items.map((mail, i) => `<article class="mail-row${!mail.isRead ? ' is-unread' : ''}${mail.id === state.selected?.id ? ' is-active' : ''}" data-email-id="${ui_escape(mail.id)}" data-testid="email-row-${ui_escape(mail.id)}" data-read="${mail.isRead}"><button class="email-row-open" data-open="${ui_escape(mail.id)}" aria-label="Read ${ui_escape(mail.subject)}" aria-pressed="${mail.id === state.selected?.id}"><span class="mail-row-avatar ma-${i % 5 + 1}">${ui_escape((mail.from.name || mail.from.address).slice(0, 2).toUpperCase())}</span><span class="mail-row-body"><span class="mail-row-top"><span class="mail-row-from">${ui_escape(mail.from.name || mail.from.address)}</span><span class="mail-row-time">${ui_escape(date(mail.sentAt || mail.receivedAt))}</span></span><span class="mail-row-subject">${ui_escape(mail.subject || '(No subject)')}</span><span class="mail-row-preview">${ui_escape(mail.bodyText)}</span><span class="mail-row-tags">${tags(mail)}${mail.attachments.length ? `<span class="mail-tag attach">${mail.attachments.length} files</span>` : ''}</span></span></button><button class="mail-star${mail.isStarred ? ' is-on' : ''}" data-star="${ui_escape(mail.id)}" aria-label="${mail.isStarred ? 'Unstar' : 'Star'} ${ui_escape(mail.subject)}" aria-pressed="${mail.isStarred}" data-testid="star-${ui_escape(mail.id)}">${starIcon}</button></article>`).join('') : '<p class="email-empty" data-testid="empty-mailbox">No messages match this view.</p>';
    $('[data-page-info]').textContent = `${page.total ? state.offset + 1 : 0}–${Math.min(state.offset + state.limit, page.total)} / ${page.total}`;
  }

  async function renderReader() {
    if (disposed) return;
    if (!state.selected) { $('[data-reader]').innerHTML = '<div class="reader-scroll">Select a message to read it.</div>'; $('.mail-shell').classList.remove('has-selection'); return; }
    const mail = await service.getEmailById(state.selected.id);
    if (disposed) return;
    state.selected = mail;
    const thread = await service.getThread(mail.threadId);
    if (disposed) return;
    if (!thread.some((item) => item.id === mail.id)) thread.push(mail);
    $('[data-reader]').innerHTML = `<div class="reader-toolbar">${ui_button('back-list', 'Back to list')}<div class="email-actions">${ui_button('toggle-read', mail.isRead ? 'Mark unread' : 'Mark read')}${ui_button('archive', 'Archive')}${ui_button('delete', 'Move to Trash')}<label>Move to<select data-testid="move-folder" data-move><option value="">Choose folder</option>${state.folders.filter((folder) => !folder.virtual && !['sent', 'drafts'].includes(folder.id)).map((f) => `<option value="${ui_escape(f.id)}">${ui_escape(f.name)}</option>`).join('')}</select></label></div></div><div class="reader-scroll"><h2 class="reader-subject">${ui_escape(mail.subject || '(No subject)')}</h2><p data-testid="delivery-status">${ui_escape(mail.deliveryStatus)}</p><div class="reader-meta-row">${tags(mail)}</div><fieldset class="email-label-editor"><legend>Labels for selected message</legend>${state.labels.map((label) => `<label><input type="checkbox" data-email-label="${ui_escape(label.id)}" ${mail.labels.includes(label.id) ? 'checked' : ''}> ${ui_escape(label.name)}</label>`).join('')}${ui_button('apply-labels', 'Apply labels')}</fieldset><p data-testid="thread-count">${thread.length} message(s) in this thread</p>${thread.map((item) => `<article class="reader-card" data-testid="thread-message-${ui_escape(item.id)}"><div class="reader-card-head"><div class="reader-from-block"><div class="reader-from-name">${ui_escape(item.from.name)}</div><div class="reader-from-email">${ui_escape(item.from.address)}</div><div class="reader-from-meta">To: ${ui_escape(addresses(item.to))}${item.cc.length ? `<br>Cc: ${ui_escape(addresses(item.cc))}` : ''}</div></div><time>${ui_escape(date(item.sentAt || item.receivedAt))}</time></div><div class="reader-body email-body-text">${ui_escape(item.bodyText)}</div>${item.attachments.length ? `<div class="reader-attach"><div class="reader-attach-head">Attachments</div>${item.attachments.map((attachment) => `<div class="reader-attach-item"><div class="attach-meta"><div class="attach-name">${ui_escape(attachment.name)}</div><div class="attach-size">${size(attachment.size)} · ${ui_escape(attachment.type)}</div></div>${attachment.available ? `<button class="btn btn--ghost" data-download="${ui_escape(attachment.id)}" data-testid="download-${ui_escape(attachment.id)}">Download</button>` : '<span>Sample only · no file content</span>'}</div>`).join('')}</div>` : ''}</article>`).join('')}<div class="email-actions">${mode === 'internal' && hub ? ui_button('followup-task', 'Create follow-up task') : ''}${mail.folderId === 'drafts' ? ui_button('edit-draft', 'Edit draft') : ui_button('reply', 'Reply') + ui_button('reply-all', 'Reply all') + ui_button('forward', 'Forward')}</div></div>`;
    $('.mail-shell').classList.add('has-selection');
  }

  function openCompose(data = {}) {
    composeTrigger = document.activeElement;
    state.compose = data; state.attachments = [...(data.attachments || [])];
    form.reset();
    for (const name of ['to', 'cc', 'bcc']) form.elements[name].value = addresses(data[name]);
    form.elements.subject.value = data.subject || ''; form.elements.bodyText.value = data.bodyText || '';
    $('[data-compose-error]').textContent = ''; renderComposeAttachments();
    $('#compose-title').textContent = data.id ? 'Edit draft' : 'New message';
    if (dialog && !dialog.open) dialog.showModal();
    form.elements.to.focus();
  }
  function closeCompose() {
    state.compose = null; state.attachments = []; form.reset(); window.dispatchEvent(new CustomEvent('adminator-form-saved', {detail:form}));
    if (dialog?.open) dialog.close();
    restoreComposeFocus = state.busy && !standalone;
    composeTrigger?.focus();
    if (standalone) openCompose();
  }
  function renderComposeAttachments() {
    $('[data-compose-attachments]').innerHTML = state.attachments.map((attachment) => `<div class="reader-attach-item"><span>${ui_escape(attachment.name)} · ${size(attachment.size)}${attachment.available ? '' : ' · sample only'}</span><button type="button" class="btn btn--ghost" data-remove-attachment="${ui_escape(attachment.id)}" aria-label="Remove ${ui_escape(attachment.name)}">Remove</button></div>`).join('');
  }
  function composeData() {
    return { ...state.compose, to: form.elements.to.value, cc: form.elements.cc.value, bcc: form.elements.bcc.value,
      subject: form.elements.subject.value, bodyText: form.elements.bodyText.value, attachments: state.attachments };
  }
  async function select(id) {
    let mail = await service.getEmailById(id);
    if (!mail.isRead && mail.folderId !== 'drafts') mail = await service.markAsRead(id);
    state.selected = mail; await refresh(); await renderReader();
  }
  async function mutate(operation, clear = false) {
    await operation();
    if (clear) state.selected = null;
    await refresh(); await renderReader();
  }
  const actions = {
    'followup-task': () => createTask(hub, state.selected.subject || 'Follow-up mail', {kind:'mail',id:state.selected.id}),
    refresh: () => run(async () => { await refresh(); if (state.selected) await renderReader(); }, 'Mailbox refreshed'),
    compose: () => openCompose(),
    'cancel-compose': () => { closeCompose(); status('Composition cancelled. Previously saved drafts are retained.'); },
    'save-draft': () => run(async () => {
      const draft = await service.saveDraft(composeData()); state.compose = draft; window.dispatchEvent(new CustomEvent('adminator-form-saved', {detail:form}));
      await refresh(); if (state.selected?.id === draft.id) await renderReader();
    }, 'Draft saved'),
    'reset-mail': () => run(async () => {
      await service.reset(); state.selected = null; state.folderId = 'inbox'; state.offset = 0;
      state.query = ''; state.category = ''; state.label = ''; state.read = undefined; state.starred = undefined; state.sort = 'newest';
      if (!standalone) {
        $('[data-testid="search-mail"]').value = '';
        root.querySelectorAll('[data-filter]').forEach((el) => { el.value = el.dataset.filter === 'sort' ? 'newest' : ''; });
        root.querySelectorAll('[data-category]').forEach((el) => { el.classList.toggle('is-active', !el.dataset.category); el.setAttribute('aria-pressed', String(!el.dataset.category)); });
      }
      closeCompose(); await refresh(); if (!standalone) await renderReader();
    }, 'Mock mailbox reset'),
    'fail-next': () => { service.failNext(); status('Next mailbox operation will fail once. Retry to recover.'); },
    'toggle-read': () => run(() => mutate(() => state.selected.isRead ? service.markAsUnread(state.selected.id) : service.markAsRead(state.selected.id)), 'Read status updated'),
    archive: () => run(() => mutate(() => service.moveEmail(state.selected.id, 'archive'), true), 'Message archived'),
    delete: () => run(() => mutate(() => service.deleteEmail(state.selected.id), true), 'Message moved to Trash'),
    'apply-labels': () => run(() => mutate(() => service.updateLabels(state.selected.id, [...root.querySelectorAll('[data-email-label]:checked')].map((el) => el.dataset.emailLabel))), 'Labels updated'),
    'back-list': () => { $('.mail-shell').classList.remove('has-selection'); },
    'previous-page': () => run(async () => { state.offset = Math.max(0, state.offset - state.limit); await refresh(); }),
    'next-page': () => run(async () => { state.offset += state.limit; await refresh(); }),
  };
  for (const [action, mode] of Object.entries({ reply: 'reply', 'reply-all': 'reply-all', forward: 'forward', 'edit-draft': 'draft' })) {
    actions[action] = () => run(async () => { openCompose(await service.composeFrom(state.selected.id, mode)); }, 'Composition ready');
  }
  root.addEventListener('click', (event) => {
    const target = event.target.closest('button'); if (!target || state.busy) return;
    if (target.dataset.action) { actions[target.dataset.action]?.(); return; }
    if (target.dataset.open) { run(() => select(target.dataset.open), 'Message selected'); return; }
    if (target.dataset.star) { run(async () => { await service.toggleStar(target.dataset.star); await refresh(); }, 'Star updated'); return; }
    if (target.dataset.folder) {
      run(async () => { state.folderId = target.dataset.folder; state.offset = 0; state.selected = null; await refresh(); await renderReader(); $('.mail-shell').classList.remove('has-selection'); }); return;
    }
    if (target.dataset.label) { $('[data-filter="label"]').value = target.dataset.label; state.label = target.dataset.label; state.offset = 0; run(refresh); return; }
    if (target.hasAttribute('data-category')) {
      state.category = target.dataset.category; state.offset = 0;
      root.querySelectorAll('[data-category]').forEach((el) => { el.classList.toggle('is-active', el === target); el.setAttribute('aria-pressed', String(el === target)); }); run(refresh); return;
    }
    if (target.dataset.removeAttachment) { state.attachments = state.attachments.filter((a) => a.id !== target.dataset.removeAttachment); renderComposeAttachments(); return; }
    if (target.dataset.download) run(async () => {
      const file = await service.downloadAttachment(target.dataset.download);
      const url = file.dataUrl || file.url;
      if (!url || (!/^data:(text\/plain|text\/csv|application\/pdf|image\/(png|jpeg|gif));base64,/.test(url) && !/^https?:\/\//.test(url))) throw Error('No safe download is available.');
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.rel = 'noopener'; anchor.click();
    }, 'Attachment download started');
  });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (state.busy) return;
    if (target.dataset.filter) {
      const key = target.dataset.filter;
      state[key] = ['read', 'starred'].includes(key) ? target.value ? target.value === 'true' : undefined : target.value;
      state.offset = 0; run(refresh);
    }
    if (target.hasAttribute('data-move') && target.value) run(() => mutate(() => service.moveEmail(state.selected.id, target.value), true), 'Message moved');
    if (target.name === 'files') {
      const files = [...target.files];
      run(async () => { for (const file of files) { const attachment = await service.uploadAttachment(file); state.attachments.push(attachment); renderComposeAttachments(); } target.value = ''; }, 'Attachments uploaded', 'Uploading attachments…');
    }
  });
  let searchTimer;
  $('[data-testid="search-mail"]')?.addEventListener('input', (event) => {
    const value = event.target.value; clearTimeout(searchTimer);
    const search = () => {
      if (state.busy) { searchTimer = setTimeout(search, 200); return; }
      state.query = value; state.offset = 0; run(refresh);
    };
    searchTimer = setTimeout(search, 200);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      const result = await service.sendEmail(composeData());
      closeCompose(); state.selected = null; await refresh(); if (!standalone) await renderReader();
      status(result.status === 'mock-sent' ? 'Mock email saved to Sent. No external email was sent.' : `Send request ${result.requestId}: ${result.status}`);
    }).then(() => {});
  });
  dialog?.addEventListener('cancel', (event) => { event.preventDefault(); if (!state.busy) { closeCompose(); status('Composition cancelled'); } });
  if (standalone) openCompose();
  await run(refresh);
  const params = new URLSearchParams(location.search);
  if (mode === 'internal' && params.get('mail') && !standalone) await run(async () => { const m = await service.getEmailById(params.get('mail')); state.folderId=m.folderId; await select(m.id); }, 'Message opened');
  if (standalone && params.get('to')) { form.elements.to.value = params.get('to'); }
  if (mode === 'internal' && hub?.preferences?.state.mailAutoRefresh && !standalone) {
    const timer = setInterval(() => { if (!disposed && !document.hidden && !state.busy && !dialog?.open) run(async () => {await refresh(); status(`Inbox updated ${new Date().toLocaleTimeString()}`);}); },30000);
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
    window.addEventListener('adminator-account-changing',()=>{recipientGeneration++;clearInterval(timer);},{once:true});
  }
  // Narrow test hooks call the service, never bypass data access; no hooks in REST mode.
  if (mode === 'mock') root.emailTest = { reset: () => actions['reset-mail'](), failNext: () => actions['fail-next']() };
  return { service, root };
}

;// ./assets/scripts/2026/auth/client.js
/** Cookie credentials stay HttpOnly; only non-authenticating CSRF tokens live in memory. */
class AuthError extends Error {
  constructor(message, status, fields = []) { super(message); this.name = 'AuthError'; this.status = status; this.fields = fields; }
}

class AuthClient {
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
      else data = await response.json();
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

function validateRegistration(data) {
  if (!/^[a-z][a-z0-9_]{2,31}$/i.test(data.username.trim())) return 'Username must start with a letter and use 3–32 letters, numbers or underscores.';
  if (!data.displayName.trim() || data.displayName.trim().length > 80 || [...data.displayName].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return 'Display Name must contain 1–80 visible characters.';
  if (data.password.length < 12 || data.password.length > 128) return 'Password must contain 12–128 characters.';
  if (data.password !== data.confirmPassword) return 'Passwords do not match.';
  return '';
}

;// ./assets/scripts/2026/auth/accounts-ui.js
/** Only public account metadata reaches the DOM; credentials live in the form until submission. */
function reloadAccount(client) {
  document.documentElement.dataset.auth = 'checking';
  window.dispatchEvent(new Event('adminator-account-changing'));
  document.querySelector('.content')?.replaceChildren();
  client.broadcastChange?.();
  window.location.reload();
}

function installAccountSwitcher(footer, client) {
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

;// ./assets/scripts/2026/auth/ui.js



function redirect(reason = 'session') {
  document.documentElement.dataset.auth = 'checking';
  window.dispatchEvent(new Event('adminator-account-changing'));
  document.querySelector('.content')?.replaceChildren();
  if (reason === 'account-changed') { window.location.reload(); return; }
  window.location.replace(`/signin.html?reason=${encodeURIComponent(reason)}`);
}

async function initializeAuthentication() {
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

function renderCurrentUser({ user, client }) {
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

;// ./assets/scripts/2026/email/account-persistence.js
/** Authenticated fixture state storage; the backend derives ownership from its session. */
function accountEmailConfig(user, client, config = {}) {
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

;// ./assets/scripts/2026/chat.js



async function initChatPage(mockService, liveService) {
  let service = mockService; let live = false;
  const shell = document.querySelector('.chat-shell'); if (!shell || !service) return;
  let rooms = []; let selected = ''; let busy = false; const params = new URLSearchParams(location.search); const targetRoom = params.get('room'); const targetMessage = params.get('message'); let anchorPending = Boolean(targetMessage); const prefs = liveService.preferences; 
  document.querySelector('.hero-sub').textContent = 'Mock chat · Messages are saved to your account only. No messages are delivered to other users.';
  shell.innerHTML = `<aside class="chat-rail"><div class="chat-rail-head"><h2 class="chat-rail-title">Conversations <span class="meta">MOCK</span></h2><label class="chat-search">Search rooms<input type="search" data-testid="chat-search" aria-label="Search rooms"></label></div><div class="chat-list-scroll" data-testid="chat-rooms"></div><form class="workspace-room-controls" data-testid="chat-room-form"><label for="chat-room-name">New private mock room</label><input id="chat-room-name" data-testid="chat-room-name" maxlength="80"><button class="btn" data-testid="chat-room-create">Create room</button><button type="button" class="btn" data-testid="chat-reset">Reset my chat samples</button></form></aside><section class="chat-pane"><div class="chat-pane-head" data-testid="chat-room-heading"></div><div class="chat-thread" data-testid="chat-messages" role="log" aria-label="Chat messages" aria-live="polite"></div><div class="chat-composer"><label for="chat-message">Message · Enter sends, Shift+Enter adds a line</label><div class="chat-composer-input"><textarea id="chat-message" rows="2" data-testid="chat-input" maxlength="4000"></textarea><button class="chat-composer-send" aria-label="Send message" data-testid="chat-send"><svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/></svg></button></div><p class="workspace-status" role="status" data-testid="chat-status">Loading conversations…</p><p role="alert" data-testid="chat-error"></p></div></section>`;
  const tools = document.createElement('div'); tools.className = 'hub-toolbar'; tools.innerHTML = '<button class="btn" data-room-favorite>Favorite room</button><label>Find messages<input type="search" data-room-message-query minlength="2"></label><button class="btn" data-room-search>Search messages</button><div data-room-results></div>'; shell.before(tools);
  tools.querySelector('[data-room-favorite]').onclick = () => run(async () => { if (!live || !selected) throw Error('Select a live conversation first.'); const favorites = prefs.state.favoriteRooms.includes(selected) ? prefs.state.favoriteRooms.filter(id => id !== selected) : [...prefs.state.favoriteRooms,selected]; await prefs.save({favoriteRooms:favorites}); renderRooms(); }, 'Favorites saved.');
  tools.querySelector('[data-room-search]').onclick = () => run(async () => { const q = tools.querySelector('input').value; const r = await liveService.client.request(`/api/search?${new URLSearchParams({q,kind:'chat',roomId:selected})}`); tools.querySelector('[data-room-results]').innerHTML = r.results.map(m => `<a class="hub-item" href="${escapeHtml(m.href)}">${escapeHtml(m.text)}</a>`).join('') || 'No matching messages.'; }, 'Search complete.');
  const mode = document.createElement('button'); mode.className = 'btn'; mode.dataset.testid = 'chat-mode'; mode.textContent = 'Switch to real account chat'; shell.before(mode);
  const users = document.createElement('div'); users.dataset.testid = 'chat-user-results'; shell.querySelector('.chat-rail-head').append(users);
  const userSearch = document.createElement('input'); userSearch.type = 'search'; userSearch.placeholder = 'Find a real user (2+ characters)'; userSearch.setAttribute('aria-label', 'Find real users'); userSearch.dataset.testid = 'chat-user-search'; userSearch.hidden = true; users.before(userSearch);
  let searchGeneration = 0;
  userSearch.oninput = async () => { const generation = ++searchGeneration; users.textContent = ''; if (userSearch.value.trim().length < 2) return; try { const result = await liveService.searchUsers(userSearch.value); if (generation !== searchGeneration) return; users.innerHTML = result.users.map(user => `<button class="btn" data-user-id="${escapeHtml(user.id)}">${escapeHtml(user.displayName)} (${escapeHtml(user.username)})</button>`).join('') || '<p>No users found.</p>'; users.querySelectorAll('button').forEach(button => { button.onclick = () => run(async () => { const room = await liveService.create(button.dataset.userId); selected = room.id; await liveService.read(selected); await refresh(); }, 'Account conversation opened.'); }); } catch(error) { errorBox.textContent = error.message; } };
  mode.onclick = async () => { if (busy) return; live = !live; service = live ? liveService : mockService; selected = live && targetRoom ? targetRoom : '';  userSearch.hidden = !live; users.textContent = ''; shell.querySelector('form label').textContent = live ? 'New shared room' : 'New private mock room'; shell.querySelector('[data-testid="chat-reset"]').hidden = live; shell.querySelector('.meta').textContent = live ? 'LIVE' : 'MOCK'; mode.textContent = live ? 'Switch to preserved mock chat' : 'Switch to real account chat'; document.querySelector('.hero-sub').textContent = live ? 'Real account messaging · Persisted messages, live updates and participant read receipts.' : 'Mock chat · Saved only to your account, no delivery.'; if (live) liveService.connect(); else liveService.stop(); try { await refresh(); if (live && selected && (!targetRoom || selected === targetRoom)) { await liveService.read(selected); await refresh(); } status.textContent = live ? 'Live chat ready. Find a user to start.' : 'Chat ready · mock mode.'; } catch(error) { errorBox.textContent = error.message; } };
  let syncing = false; let syncAgain = false;
  liveService.onstatus = text => { if (live && !busy) status.textContent = text; };
  liveService.onchange = async payload => { if (!live) return; if (busy || syncing) { syncAgain = true; return; } syncing = true; try { if (selected) { if (payload?.type === 'message' && payload.roomId === selected && document.visibilityState === 'visible') await liveService.read(selected); else await liveService.history(selected); } await refresh(); } catch(error) { errorBox.textContent = error.message; } finally { syncing = false; if (syncAgain && !busy) { syncAgain = false; liveService.onchange(); } } };
  document.addEventListener('visibilitychange', () => { if (live && selected && document.visibilityState === 'visible') run(async () => { await service.read(selected); await refresh(); }, 'Conversation read.'); });
  window.addEventListener('pagehide', () => liveService.stop());
  window.addEventListener('adminator-account-changing', () => liveService.stop());
  const input = shell.querySelector('[data-testid="chat-input"]'); const status = shell.querySelector('[data-testid="chat-status"]'); const errorBox = shell.querySelector('[data-testid="chat-error"]'); const search = shell.querySelector('[data-testid="chat-search"]');
  function renderRooms() {
    shell.querySelector('[data-testid="chat-rooms"]').innerHTML = [...rooms].sort((a,b)=>Number(prefs?.state.favoriteRooms.includes(b.id))-Number(prefs?.state.favoriteRooms.includes(a.id))).filter(room => room.name.toLowerCase().includes(search.value.toLowerCase())).map(room => { const last = room.messages.at(-1); const unread = service.unread(room); return `<button class="chat-conv ${selected === room.id ? 'is-active' : ''}" data-testid="chat-room" data-room-id="${escapeHtml(room.id)}" aria-pressed="${selected === room.id}"><div class="chat-conv-avatar ma-2">${escapeHtml(room.name.slice(0, 2).toUpperCase())}</div><div class="chat-conv-body"><div class="chat-conv-top"><span class="chat-conv-name">${live && prefs.state.favoriteRooms.includes(room.id) ? '★ ' : ''}${escapeHtml(room.name)}</span><span class="chat-conv-time">${last ? escapeHtml(new Date(last.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : ''}</span></div><div class="chat-conv-preview">${escapeHtml(last?.body || 'No messages yet')}</div>${unread ? `<span class="chat-conv-badge" data-testid="chat-unread" aria-label="${unread} unread messages">${unread}</span>` : ''}</div></button>`; }).join('') || '<p class="workspace-sample">No matching rooms.</p>';
    shell.querySelectorAll('[data-room-id]').forEach(button => { button.onclick = () => run(async () => { await service.read(button.dataset.roomId); selected = button.dataset.roomId; await refresh(); }, 'Conversation opened.'); });
  }
  function renderThread() {
    const room = rooms.find(item => item.id === selected);
    shell.querySelector('[data-testid="chat-room-heading"]').textContent = room ? `${room.name} · ${live ? 'Real account conversation' : 'Account-only mock conversation'}` : 'Choose a conversation';
    const thread = shell.querySelector('[data-testid="chat-messages"]');
    thread.innerHTML = room?.messages.map(message => `<div class="chat-msg ${message.senderId === service.store.user.id ? 'me' : ''}" data-testid="chat-message" data-message-id="${escapeHtml(message.id)}"><div class="chat-msg-av">${escapeHtml(message.senderName.slice(0, 2).toUpperCase())}</div><div class="chat-msg-stack"><div class="chat-bub">${escapeHtml(message.body)}</div>${live ? `<button class="btn hub-source-action" data-followup="${escapeHtml(message.id)}">Create task</button>` : ''}<div class="chat-msg-meta">${escapeHtml(message.senderName)} · <time datetime="${escapeHtml(message.sentAt)}">${escapeHtml(new Date(message.sentAt).toLocaleString())}</time> · ${live ? (Object.entries(room.readCursors).some(([uid, seq]) => uid !== service.store.user.id && seq >= message.sequence) && message.senderId === service.store.user.id ? 'Read by recipient' : 'Stored on server') : message.delivery === 'fixture' ? 'Sample message' : 'Saved in mock · not delivered'}</div></div></div>`).join('') || '<p>No messages yet.</p>';
    input.disabled = !room || busy; shell.querySelector('[data-testid="chat-send"]').disabled = !room || busy;
    thread.querySelectorAll('[data-followup]').forEach(button => { button.onclick = () => { const message = room.messages.find(m => m.id === button.dataset.followup); createTask(liveService.hub, message.body, {kind:'chat',id:message.id,roomId:room.id}); }; });
    tools.querySelector('[data-room-favorite]').textContent = live && prefs.state.favoriteRooms.includes(selected) ? '★ Remove favorite' : '☆ Favorite room';
    requestAnimationFrame(() => { const target = anchorPending ? [...thread.querySelectorAll('[data-message-id]')].find(el => el.dataset.messageId === targetMessage) : null; if (target) {target.classList.add('hub-highlight'); target.scrollIntoView({block:'center'}); anchorPending = false;} else thread.scrollTop = thread.scrollHeight; });
  }
  async function refresh() { rooms = await service.list(); if (!rooms.some(room => room.id === selected)) selected = rooms[0]?.id || ''; renderRooms(); renderThread(); }
  async function run(action, message) {
    if (busy) return; busy = true; errorBox.textContent = ''; status.textContent = 'Saving…'; shell.setAttribute('aria-busy', 'true'); shell.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { await action(); status.textContent = message; }
    catch (error) { errorBox.textContent = error.message; status.textContent = 'Not saved. Retry or reload if data changed.'; }
    finally { busy = false; shell.removeAttribute('aria-busy'); shell.querySelectorAll('button').forEach(button => { button.disabled = false; }); input.disabled = !selected; shell.querySelector('[data-testid="chat-send"]').disabled = !selected; if (live && syncAgain) { syncAgain = false; liveService.onchange(); } }
  }
  function send() {
    const body = input.value; if (!body.trim()) { errorBox.textContent = 'Enter a message before sending.'; return; }
    run(async () => { await service.send(selected, body); if (live) await service.read(selected); input.value = ''; window.dispatchEvent(new CustomEvent('adminator-form-saved',{detail:input})); await refresh(); input.focus(); }, live ? 'Message stored and sent to conversation participants.' : 'Message saved in mock. No delivery to another user.');
  }
  input.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } }; shell.querySelector('[data-testid="chat-send"]').onclick = send; search.oninput = renderRooms;
  shell.querySelector('form').onsubmit = event => { event.preventDefault(); const name = shell.querySelector('[data-testid="chat-room-name"]'); run(async () => { const room = await (live ? liveService.createShared(name.value) : service.create(name.value)); selected = room.id; name.value = ''; await refresh(); }, live ? 'Shared room created.' : 'Private mock room created.'); };
  shell.querySelector('[data-testid="chat-reset"]').onclick = () => run(async () => { await service.reset(); selected = ''; await refresh(); }, 'Chat samples restored for this account.');
  document.querySelectorAll('.hero-actions button').forEach(button => { if (button.textContent.trim() === 'Search') button.onclick = () => search.focus(); else button.onclick = () => (live ? userSearch : shell.querySelector('[data-testid="chat-room-name"]')).focus(); });
  try { if (new URLSearchParams(location.search).get('chatMode') === 'mock') { await refresh(); status.textContent = 'Chat ready · mock mode.'; } else { await mode.onclick(); if (targetRoom) { if (rooms.some(r => r.id === targetRoom)) { selected = targetRoom; await liveService.read(selected); await refresh(); if (targetMessage && !rooms.find(r => r.id === selected)?.messages.some(m => m.id === targetMessage)) errorBox.textContent = 'Message unavailable. This conversation remains available.'; } else errorBox.textContent = 'Conversation unavailable or access changed.'; } status.textContent = 'Shared chat ready.'; } }
  catch (error) { errorBox.textContent = error.message; status.textContent = 'Loading failed. Reload to retry.'; }
}

;// ./assets/scripts/2026/dashboard.js



async function initDashboard(services, user) {
  if (document.body.dataset.active !== 'dashboard') return;
  const main = document.querySelector('main.content');
  main.innerHTML = `<section class="hero"><div class="hero-text"><span class="eyebrow" data-home-date></span><h1 class="hero-title">Welcome, <span class="accent">${escapeHtml(user.displayName)}</span></h1><p class="hero-sub">Your day, tasks and conversations in one place.</p></div><div class="hero-actions"><a class="btn" href="calendar.html?new=1">New event</a><a class="btn" href="tasks.html?new=1">New task</a><a class="btn" href="compose.html">New mail</a><a class="btn" href="settings.html">Customize home</a><button class="btn" data-home-refresh>Refresh</button></div></section><p role="status" class="workspace-status" data-testid="dashboard-status"></p><div class="hub-metrics" data-home-metrics></div><div class="hub-grid" data-home-cards></div><section class="card hub-panel"><h2>Needs attention</h2><div data-home-attention></div><div><a href="attention.html">View all</a> · <a href="reports.html">Work report</a></div></section>`;
  const status = main.querySelector('[role="status"]'); let busy = false; let disposed = false;
  window.addEventListener('adminator-account-changing', () => { disposed = true; main.replaceChildren(); }, {once:true});
  async function render() {
    if (busy || disposed) return; busy = true; status.textContent = 'Loading your workspace…'; main.querySelector('button').disabled = true;
    try {
      const zone = services.preferences.state.timezone;
      const [s,attention] = await Promise.all([services.client.request(`/api/dashboard?timezoneName=${encodeURIComponent(zone)}&scope=${services.preferences.state.calendarScope}`),services.client.request('/api/attention'),services.tasks.load()]);
      if (disposed) return;
      main.querySelector('[data-home-date]').textContent = `${new Intl.DateTimeFormat(undefined,{timeZone:zone,dateStyle:'full'}).format(new Date())} · ${zone}`;
      const tasks = services.tasks.state.tasks;
      const metrics = [['Today’s events',s.todayEvents.length,'calendar.html'],['Open tasks',tasks.filter(t=>!t.done).length,'tasks.html'],['Unread mail',s.unreadEmail,'email.html?mailMode=internal'],['Unread chat',s.unreadChat,'chat.html']];
      main.querySelector('[data-home-metrics]').innerHTML = metrics.map(([title,value,href],i)=>`<a href="${href}" class="card hub-panel kpi-card"><span class="kpi-label">${title}</span><strong class="kpi-value" data-testid="dashboard-metric-${i}">${value}</strong></a>`).join('');
      const heading = (label,href)=>`<div class="card-head"><h2 class="card-title">${label}</h2><a class="card-action" href="${href}">View all</a></div>`;
      const events = s.todayEvents.length ? s.todayEvents : s.upcomingEvents.slice(0,5);
      const panels = {
        calendar: heading(s.todayEvents.length ? 'Today’s calendar':'Upcoming calendar','calendar.html') + events.slice(0,5).map(e=>`<a class="hub-item" href="${escapeHtml(resourceLink('calendar',e.id))}"><strong>${escapeHtml(e.title)}</strong><small>${escapeHtml(e.allDay ? e.start : new Date(e.start).toLocaleString(undefined,{timeZone:zone}))}</small></a>`).join('') + (!events.length?'<p>No upcoming events.</p>':''),
        tasks: `${heading('My tasks','tasks.html')  }<form class="workspace-task-form" data-home-task-form><label for="dashboard-task-title">New task</label><input id="dashboard-task-title" data-testid="dashboard-task-title" required maxlength="200"><button class="btn" data-testid="dashboard-task-add">Add task</button></form><ul class="todo-list">${  tasks.filter(t=>!t.done).sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')).slice(0,5).map(t=>`<li class="todo-item" data-task-id="${escapeHtml(t.id)}"><input type="checkbox" class="todo-check" data-testid="dashboard-task-toggle" aria-label="Complete ${escapeHtml(t.title)}"><a class="todo-text" href="${escapeHtml(resourceLink('tasks',t.id))}">${escapeHtml(t.title)}${t.dueDate?` · ${escapeHtml(t.dueDate)}`:''}</a></li>`).join('')  }</ul>${  !tasks.some(t=>!t.done)?'<p>No open tasks.</p>':''}`,
        mail: heading('Recent inbox','email.html?mailMode=internal') + s.recentMail.map(m=>`<a class="hub-item" href="${escapeHtml(resourceLink('mail',m.id))}"><strong>${!m.isRead?'● ':''}${escapeHtml(m.subject||'(No subject)')}</strong><small>${escapeHtml(m.from.name||m.from.address)}</small></a>`).join('') + (!s.recentMail.length?'<p>No inbox mail.</p>':''),
        chat: heading('Recent conversations','chat.html') + s.recentChats.map(r=>`<a class="hub-item" href="chat.html?room=${encodeURIComponent(r.id)}"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.messages.at(-1)?.body||'No messages')} · ${r.unread} unread</small></a>`).join('') + (!s.recentChats.length?'<p>No conversations.</p>':''),
      };
      main.querySelector('[data-home-cards]').innerHTML = services.preferences.state.homeCards.map(key=>`<section class="card hub-panel" data-home-card="${key}">${panels[key]}</section>`).join('');
      main.querySelector('[data-home-attention]').innerHTML = attention.items.slice(0,3).map(i=>`<a class="hub-item" href="${escapeHtml(i.href)}">${escapeHtml(i.title)}<small>${escapeHtml(i.detail)}</small></a>`).join('') || '<p>You are up to date.</p>';
      const form = main.querySelector('[data-home-task-form]'); if (form) form.onsubmit = async e=> {e.preventDefault(); const title=form.querySelector('input').value.trim(); if(!title || busy) return; busy=true; form.querySelector('button').disabled=true; try { await services.tasks.mutate(state=>state.tasks.push({id:crypto.randomUUID(),title,done:false})); window.dispatchEvent(new CustomEvent('adminator-form-saved',{detail:form})); busy=false; await render(); } catch(error) {status.textContent=error.message;} finally {busy=false; form.querySelector('button').disabled=false;} };
      main.querySelectorAll('[data-task-id] input').forEach(input=>{input.onchange=async()=>{if(busy)return; busy=true; input.disabled=true; try {await services.tasks.mutate(state=>taskCompletion(state.tasks.find(t=>t.id===input.closest('[data-task-id]').dataset.taskId),input.checked)); busy=false; await render();}catch(error){status.textContent=error.message;input.checked=false;}finally{busy=false;input.disabled=false;} };});
      status.textContent = `Updated ${new Date().toLocaleTimeString()} · ${zone}`;
    } catch(error) {status.textContent=`${error.message} Use Refresh to retry.`;} finally {busy=false; if(!disposed)main.querySelector('[data-home-refresh]').disabled=false;}
  }
  main.querySelector('button').onclick=()=>{if(window.adminatorCanLeave())render();}; await render();
}

;// ./assets/scripts/2026/workspace/menus.js


async function initWorkspaceMenus(services) {
  if (!document.querySelector('.shell')) return;
  let disposed = false;
  window.addEventListener('adminator-account-changing',()=>{disposed=true;clearInterval(timer);},{once:true});
  async function refresh() {
    try {
      const [attention,rooms] = await Promise.all([services.client.request('/api/attention'),services.liveChat.list()]);
      if(disposed)return;
      for(const [label,items,href,count] of [
        ['Notifications',attention.items,'attention.html',attention.items.length],
        ['Messages',rooms.filter(r=>r.unread).map(r=>({title:r.name,detail:`${r.unread} unread messages`,href:`chat.html?room=${encodeURIComponent(r.id)}`})),'chat.html',rooms.reduce((n,r)=>n+r.unread,0)],
      ]) {
        const button=document.querySelector(`button[aria-label="${label}"]`); if(!button)continue; const menu=button.parentElement.querySelector('.dd-menu'); button.querySelector('.count').textContent=count; menu.querySelector('.dd-head').textContent=label==='Notifications'?'Needs attention':'Unread conversations'; menu.querySelector('.dd-list').innerHTML=items.slice(0,5).map(i=>`<a class="dd-item" href="${escapeHtml(i.href)}"><div class="dd-body"><div class="dd-text">${escapeHtml(i.title)}</div><div class="dd-preview">${escapeHtml(i.detail)}</div></div></a>`).join('')||'<p class="hub-panel">You are up to date.</p>'; menu.querySelector('.dd-footer').href=href; menu.querySelector('.dd-footer').textContent='View all →';
      }
    }catch{ if(!disposed) document.querySelectorAll('.dd-list').forEach(el=>{el.textContent='Unable to refresh. Reopen this page to retry.';}); }
  }
  let busy=false;
  const timer=setInterval(async()=>{if(disposed||busy||document.hidden)return;busy=true;try{await refresh();}finally{busy=false;}},30000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});await refresh();
}

;// ./assets/scripts/2026/index.js


/**
 * 2026 entry point.
 *
 * Order of operations:
 *   1. Import the SCSS bundle (extracted to its own CSS file in production).
 *   2. Mount the shell (sidebar/topbar/footer) into the page placeholders.
 *   3. Wire shell behaviors (theme toggle, dropdowns, nav groups, todos).
 *
 * Each *-2026.html page has data-active + data-crumbs on <body> and three
 * placeholder divs ([data-shell-sidebar], [data-shell-topbar],
 * [data-shell-footer]) inside the .shell wrapper.
 */
















async function start() {
  const aliases = {'basic-table':'calendar.html?view=agenda',datatable:'tasks.html'};
  if (aliases[document.body.dataset.active]) { location.replace(aliases[document.body.dataset.active]); return; }
  const auth = await initializeAuthentication();
  if (!auth || (!auth.user && document.querySelector('.shell'))) return;
  mountShell();
  renderCurrentUser(auth);
  initShellBehaviors();
  initPalette();
  if (!['forms', 'charts', 'blank'].includes(document.body.dataset.active)) initTemplatePages();
  installDirtyGuard();
  initVectorMaps();
  let services;
  if (auth.user) {
    services = workspaceServices(auth);
    services.preferences = new AccountPreferences(auth.client);
    try { await services.preferences.load(); applyPreferences(services.preferences.state); }
    catch (error) { const notice = document.createElement('p'); notice.setAttribute('role', 'alert'); notice.textContent = error.message; document.querySelector('main')?.prepend(notice); return; }
    document.querySelector('#themeToggle')?.addEventListener('click', async () => {
      try { await services.preferences.save({theme:document.documentElement.dataset.theme}); }
      catch (error) { const notice=document.createElement('p'); notice.setAttribute('role','alert'); notice.textContent=`Theme not saved: ${error.message}`; document.querySelector('main')?.prepend(notice); }
    });
    services.calendar.preferences = services.preferences;
    services.calendar.user = auth.user;
    services.calendar.timezone = services.preferences.state.timezone;
    services.liveChat.preferences = services.preferences;
    services.calendar.hub = services;
    services.liveChat.hub = services;
    await initServiceHub(services, auth);
    await initCalendarPage(services.calendar);
    await initChatPage(services.chat, services.liveChat);
    await initDashboard(services, auth.user);
    await initWorkspaceMenus(services);
  }
  initCharts();
  if (auth.user) { await initEmailPage({ config: { ...accountEmailConfig(auth.user, auth.client, globalThis.ADMINATOR_EMAIL_CONFIG || {}), hub: services } }); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}


/***/ }

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ var __webpack_exports__ = (__webpack_exec__(252));
/******/ }
]);