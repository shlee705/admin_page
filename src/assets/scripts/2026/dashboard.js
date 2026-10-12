import { escapeHtml as esc } from './workspace/store.js';
import { taskCompletion, resourceLink } from './service-hub.js';

export async function initDashboard(services, user) {
  if (document.body.dataset.active !== 'dashboard') return;
  const main = document.querySelector('main.content');
  main.innerHTML = `<section class="hero"><div class="hero-text"><span class="eyebrow" data-home-date></span><h1 class="hero-title">Welcome, <span class="accent">${esc(user.displayName)}</span></h1><p class="hero-sub">Your day, tasks and conversations in one place.</p></div><div class="hero-actions"><a class="btn" href="calendar.html?new=1">New event</a><a class="btn" href="tasks.html?new=1">New task</a><a class="btn" href="compose.html">New mail</a><a class="btn" href="settings.html">Customize home</a><button class="btn" data-home-refresh>Refresh</button></div></section><p role="status" class="workspace-status" data-testid="dashboard-status"></p><div class="hub-metrics" data-home-metrics></div><div class="hub-grid" data-home-cards></div><section class="card hub-panel"><h2>Needs attention</h2><div data-home-attention></div><div><a href="attention.html">View all</a> · <a href="reports.html">Work report</a></div></section>`;
  const status = main.querySelector('[role="status"]'); let busy = false; let disposed = false; let preferenceRefreshPending = false;
  window.addEventListener('adminator-account-changing', () => { disposed = true; main.replaceChildren(); }, {once:true});
  async function render() {
    if (busy || disposed) return; busy = true; status.textContent = 'Loading your workspace…'; main.querySelector('button').disabled = true;
    const taskDraft = main.querySelector('[data-home-task-form] input')?.value || '';
    const pendingTaskCard = taskDraft && !services.preferences.state.homeCards.includes('tasks') ? main.querySelector('[data-home-card="tasks"]') : null;
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
        calendar: heading(s.todayEvents.length ? 'Today’s calendar':'Upcoming calendar','calendar.html') + events.slice(0,5).map(e=>`<a class="hub-item" href="${esc(resourceLink('calendar',e.id))}"><strong>${esc(e.title)}</strong><small>${esc(e.allDay ? e.start : new Date(e.start).toLocaleString(undefined,{timeZone:zone}))}</small></a>`).join('') + (!events.length?'<p>No upcoming events.</p>':''),
        tasks: `${heading('My tasks','tasks.html')  }<form class="workspace-task-form" data-home-task-form><label for="dashboard-task-title">New task</label><input id="dashboard-task-title" data-testid="dashboard-task-title" required maxlength="200"><button class="btn" data-testid="dashboard-task-add">Add task</button></form><ul class="todo-list">${  tasks.filter(t=>!t.done).sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')).slice(0,5).map(t=>`<li class="todo-item" data-task-id="${esc(t.id)}"><input type="checkbox" class="todo-check" data-testid="dashboard-task-toggle" aria-label="Complete ${esc(t.title)}"><a class="todo-text" href="${esc(resourceLink('tasks',t.id))}">${esc(t.title)}${t.dueDate?` · ${esc(t.dueDate)}`:''}</a></li>`).join('')  }</ul>${  !tasks.some(t=>!t.done)?'<p>No open tasks.</p>':''}`,
        mail: heading('Recent inbox','email.html?mailMode=internal') + s.recentMail.map(m=>`<a class="hub-item" href="${esc(resourceLink('mail',m.id))}"><strong>${!m.isRead?'● ':''}${esc(m.subject||'(No subject)')}</strong><small>${esc(m.from.name||m.from.address)}</small></a>`).join('') + (!s.recentMail.length?'<p>No inbox mail.</p>':''),
        chat: heading('Recent conversations','chat.html') + s.recentChats.map(r=>`<a class="hub-item" href="chat.html?room=${encodeURIComponent(r.id)}"><strong>${esc(r.name)}</strong><small>${esc(r.messages.at(-1)?.body||'No messages')} · ${r.unread} unread</small></a>`).join('') + (!s.recentChats.length?'<p>No conversations.</p>':''),
      };
      main.querySelector('[data-home-cards]').innerHTML = services.preferences.state.homeCards.map(key=>`<section class="card hub-panel" data-home-card="${key}">${panels[key]}</section>`).join('');
      // Preference recovery may hide the task card; retain an active draft until
      // the user saves/clears it instead of losing input during a background load.
      if (pendingTaskCard) main.querySelector('[data-home-cards]').append(pendingTaskCard);
      main.querySelector('[data-home-attention]').innerHTML = attention.items.slice(0,3).map(i=>`<a class="hub-item" href="${esc(i.href)}">${esc(i.title)}<small>${esc(i.detail)}</small></a>`).join('') || '<p>You are up to date.</p>';
      const form = main.querySelector('[data-home-task-form]'); if (form) {
        if (taskDraft) { form.querySelector('input').value = taskDraft; form.querySelector('input').dispatchEvent(new Event('input', { bubbles: true })); }
        form.onsubmit = async e=> {e.preventDefault(); const title=form.querySelector('input').value.trim(); if(!title || busy) return; busy=true; form.querySelector('button').disabled=true; try { await services.tasks.mutate(state=>state.tasks.push({id:crypto.randomUUID(),title,done:false})); window.dispatchEvent(new CustomEvent('adminator-form-saved',{detail:form})); form.querySelector('input').value=''; busy=false; await render(); } catch(error) {status.textContent=error.message;} finally {busy=false; form.querySelector('button').disabled=false;} };
      }
      main.querySelectorAll('[data-task-id] input').forEach(input=>{input.onchange=async()=>{if(busy)return; busy=true; input.disabled=true; try {await services.tasks.mutate(state=>taskCompletion(state.tasks.find(t=>t.id===input.closest('[data-task-id]').dataset.taskId),input.checked)); busy=false; await render();}catch(error){status.textContent=error.message;input.checked=false;}finally{busy=false;input.disabled=false;} };});
      status.textContent = `Updated ${new Date().toLocaleTimeString()} · ${zone}`;
    } catch(error) {if(!disposed)status.textContent=`${error.message} Use Refresh to retry.`;} finally {busy=false; if(!disposed) {main.querySelector('[data-home-refresh]').disabled=false; if(preferenceRefreshPending) {preferenceRefreshPending=false; await render();}}}
  }
  const unsubscribe = services.preferences.subscribe(({ status }) => { if (disposed || status !== 'ready') return; if (busy) preferenceRefreshPending = true; else render(); });
  window.addEventListener('adminator-account-changing', unsubscribe, { once:true });
  main.querySelector('button').onclick=()=>{if(window.adminatorCanLeave())render();}; await render();
}
