import { createTask } from './service-hub.js';
import { CATEGORIES, dateOnly, addDays, eventDate } from './workspace/services.js';
import { escapeHtml as esc, exportJson } from './workspace/store.js';

/** FullCalendar renders only; CalendarService validates and persists every mutation. */
export async function initCalendarPage(service) {
  const host = document.querySelector('[data-fc]'); if (!host || !service) return;
  let attendees = []; let attendeeGeneration = 0;
  const status = document.createElement('p'); status.className = 'workspace-status'; status.setAttribute('role', 'status'); status.dataset.testid = 'calendar-status'; host.before(status); status.textContent = 'Loading calendar…';
  let scope = service.preferences?.state.calendarScope || 'all';
  const related = item => scope === 'all' || (scope === 'owned' ? item.ownerId === service.user.id : scope === 'invited' ? item.attendees?.some(a => a.userId === service.user.id) : item.ownerId === service.user.id || item.attendees?.some(a => a.userId === service.user.id && a.status !== 'declined'));
  let calendar; let events = []; let editing = null; let busy = false; let filter = ''; let query = ''; let expanded = []; let createId = null; let pendingCreate = null;
  let upcomingEvents = null; let fingerprint = ''; let refreshPromise = null; let refreshAgain = false; let initialized = false; let disposed = false;
  const dialog = document.createElement('dialog'); dialog.className = 'workspace-dialog calendar-event-dialog'; dialog.dataset.testid = 'event-dialog'; dialog.setAttribute('aria-labelledby', 'event-dialog-title');
  dialog.innerHTML = `<form novalidate><h2 id="event-dialog-title">Event details</h2><label>Title<input name="title" maxlength="200" data-testid="event-title" required></label><label>Description<textarea name="description" maxlength="4000" data-testid="event-description"></textarea></label><label class="workspace-check"><input name="allDay" type="checkbox" data-testid="event-all-day">All-day event</label><label>Start<input name="start" type="datetime-local" data-testid="event-start" required></label><label><span data-end-label>End</span><input name="end" type="datetime-local" data-testid="event-end" required></label><label>Category<select name="category" data-testid="event-category">${CATEGORIES.map(category => `<option value="${category}">${category}</option>`).join('')}</select></label><label>Location<input name="location" maxlength="300" data-testid="event-location"></label><label>IANA timezone<input name="timezone" data-testid="event-timezone" required></label><label>Repeat<select name="frequency" data-testid="event-repeat"><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label>Repeat interval<input name="interval" type="number" min="1" max="30" value="1"></label><label>Occurrences (1–366)<input name="count" data-testid="event-repeat-count" type="number" min="1" max="366" value="10"></label><p data-sharing-note></p><p>Editing or deleting a recurring event applies to the entire series.</p><button type="button" class="btn" data-event-task>Create follow-up task</button><div data-conflict></div><label>Find attendees<input name="attendeeSearch" data-testid="event-attendee-search" type="search"></label><div data-testid="event-attendees"></div><div data-testid="event-response"></div><p role="alert" data-testid="event-error"></p><div class="workspace-actions"><button type="button" class="btn" data-testid="event-cancel">Cancel</button><button type="button" class="btn" data-testid="event-delete">Delete event</button><button class="btn btn--primary" data-testid="event-save">Save event</button></div></form>`;
  document.body.append(dialog); const form = dialog.querySelector('form'); const fields = form.elements;
  fields.allDay.addEventListener('change', () => {
    for (const key of ['start', 'end']) { const old = fields[key].value; fields[key].type = fields.allDay.checked ? 'date' : 'datetime-local'; fields[key].value = fields.allDay.checked ? old.slice(0, 10) : `${old.slice(0, 10)}T${key === 'start' ? '09:00' : '10:00'}`; }
    dialog.querySelector('[data-end-label]').textContent = fields.allDay.checked ? 'Last day (inclusive)' : 'End';
  });
  function open(event = null, start = new Date(), end = null, allDay = false) {
    if (busy) return;
    createId = event ? null : crypto.randomUUID(); pendingCreate = null;
    editing = event; attendeeGeneration += 1; results.replaceChildren(); form.reset(); dialog.querySelector('[data-conflict]').replaceChildren(); dialog.querySelector('[data-sharing-note]').textContent = event ? (event.shared ? 'Shared: all signed-in users can view and edit this event.' : 'Private: only the owner and invited members can view this event.') : 'New events are shared with all signed-in users. Attendee selection does not make an event private.'; dialog.querySelector('[data-event-task]').hidden = !event; window.dispatchEvent(new CustomEvent('adminator-form-saved', {detail:form})); attendees = event?.attendees?.map(a => ({ id: a.userId, displayName: a.displayName, status: a.status })) || []; renderAttendees(); dialog.querySelector('[role="alert"]').textContent = '';
    fields.title.value = event?.title || ''; fields.description.value = event?.description || ''; fields.allDay.checked = event?.allDay ?? allDay; fields.category.value = event?.category || 'work';
    fields.timezone.value = event?.timezone || service.timezone; fields.location.value = event?.location || ''; fields.frequency.value = event?.recurrence?.frequency || ''; fields.interval.value = event?.recurrence?.interval || 1; fields.count.value = event?.recurrence?.count || 10;
    const day = dateOnly(start); const from = event?.start || (allDay ? day : end ? localDate(start, false) : `${day}T09:00`); const to = event?.end || (allDay ? dateOnly(end || addDays(start, 1)) : end ? localDate(end, false) : `${day}T10:00`);
    for (const key of ['start', 'end']) fields[key].type = fields.allDay.checked ? 'date' : 'datetime-local';
    fields.start.value = fields.allDay.checked ? from.slice(0, 10) : wallTime(from, fields.timezone.value); fields.end.value = fields.allDay.checked ? dateOnly(addDays(new Date(`${to.slice(0, 10)}T12:00`), -1)) : wallTime(to, fields.timezone.value);
    dialog.querySelector('[data-end-label]').textContent = fields.allDay.checked ? 'Last day (inclusive)' : 'End'; dialog.querySelector('[data-testid="event-delete"]').hidden = !event; dialog.querySelectorAll('input,select,textarea').forEach(control => { control.disabled = event?.canEdit === false; }); dialog.querySelector('[data-testid="event-save"]').hidden = event?.canEdit === false; dialog.querySelector('[data-testid="event-delete"]').hidden = !event || event.canEdit === false; const response = dialog.querySelector('[data-testid="event-response"]'); response.innerHTML = event?.attendees?.some(a => a.userId === service.user?.id) ? '<button type="button" class="btn" data-rsvp="accepted">Accept invitation</button><button type="button" class="btn" data-rsvp="declined">Decline invitation</button>' : ''; response.querySelectorAll('[data-rsvp]').forEach(button => { button.onclick = () => operation(() => service.respond(event.id, button.dataset.rsvp), 'Invitation response saved.'); }); dialog.showModal(); fields.title.focus();
  }
  function wallTime(value, zone) { if (!/[Z+]|-\d{2}:\d{2}$/.test(value.slice(10))) return value.slice(0,16); const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date(value)); return parts.replace(' ', 'T'); }
  function renderAttendees() { const box = dialog.querySelector('[data-testid="event-attendees"]'); box.innerHTML = attendees.map(a => `<div>${esc(a.displayName)} · ${esc(a.status || 'pending')} <button type="button" class="btn" data-remove-attendee="${esc(a.id)}">Remove</button></div>`).join(''); box.querySelectorAll('button').forEach(button => { button.hidden = editing?.canEdit === false; button.onclick = () => { attendees = attendees.filter(a => a.id !== button.dataset.removeAttendee); renderAttendees(); }; }); }
  const results = document.createElement('div'); fields.attendeeSearch.after(results);
  dialog.addEventListener('close', () => { attendeeGeneration += 1; results.replaceChildren(); });
  fields.attendeeSearch.oninput = async () => { const generation = ++attendeeGeneration; results.innerHTML = ''; if (fields.attendeeSearch.value.trim().length < 2) return; try { const { users } = await service.searchUsers(fields.attendeeSearch.value); if (generation !== attendeeGeneration || !dialog.open) return; results.innerHTML = users.filter(u => !attendees.some(a => a.id === u.id)).map(u => `<button type="button" class="btn" data-add-attendee="${esc(u.id)}">${esc(u.displayName)} (${esc(u.username)})</button>`).join(''); results.querySelectorAll('button').forEach(button => { button.onclick = () => { attendees.push(users.find(u => u.id === button.dataset.addAttendee)); renderAttendees(); results.innerHTML = ''; fields.attendeeSearch.value = ''; }; }); } catch(error) { if (generation === attendeeGeneration && dialog.open) dialog.querySelector('[role="alert"]').textContent = error.message; } };
  dialog.querySelector('[data-event-task]').onclick = () => createTask(service.hub, editing.title, {kind:'calendar',id:editing.id});
  dialog.querySelector('[data-testid="event-cancel"]').onclick = () => dialog.close(); dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  async function operation(action, message) {
    if (busy) return; busy = true; const controls = [...dialog.querySelectorAll('button, input, select, textarea')].map(control => [control, control.disabled]); status.textContent = 'Saving…'; dialog.querySelectorAll('button, input, select, textarea').forEach(control => { control.disabled = true; });
    try { await action(); window.dispatchEvent(new CustomEvent('adminator-form-saved', {detail:form})); if (dialog.open) dialog.close(); status.textContent = `${message} Refreshing…`; try { await refresh(); status.textContent = message; } catch (error) { status.textContent = `${message} Refresh failed: ${error.message}`; } }
    catch (error) {
      status.textContent = error.message; dialog.querySelector('[role="alert"]').textContent = error.message;
      if (!editing && error.status >= 400 && error.status < 500 && error.status !== 409) pendingCreate = null;
      if (!editing && pendingCreate && (!error.status || error.status >= 500 || error.status === 409)) {
        dialog.querySelector('[role="alert"]').textContent = `${error.message} The original request may already be saved. Use the retry below to check it safely. Changes require resolving the original request first; opening a new form starts a separate event.`;
        const box = dialog.querySelector('[data-conflict]'); box.innerHTML = '<button class="btn" type="button" data-testid="event-retry-create">Retry original request</button>';
        box.querySelector('button').onclick = () => operation(() => service.save(pendingCreate), 'Event saved.');
      }
      if (error.status === 409 && editing) {
        try {
          await refresh(); const latest = events.find(item => item.id === editing.id);
          if (latest) { const box = dialog.querySelector('[data-conflict]'); box.innerHTML = `<h3>Another person changed this event</h3><p>Latest: ${esc(latest.title)} · ${esc(latest.start)} → ${esc(latest.end)} · revision ${latest.revision}</p><p>Your unsaved form remains above. Reload the latest version before editing again.</p><button class="btn" type="button">Load latest version</button>`; box.querySelector('button').onclick = () => { dialog.close(); open(latest); }; }
          else dialog.querySelector('[role="alert"]').textContent = 'This event was deleted. Your unsaved input remains; close and create a new event if needed.';
        } catch (refreshError) { dialog.querySelector('[role="alert"]').textContent = `${error.message} Latest event could not be loaded: ${refreshError.message}. Your unsaved input remains.`; }
      }
    }
    finally { busy = false; controls.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; }); }
  }
  form.onsubmit = event => { event.preventDefault(); const data = { ...(editing ? { id: editing.id } : { clientId: createId }), title: fields.title.value, description: fields.description.value, allDay: fields.allDay.checked, start: fields.start.value, end: fields.end.value, category: fields.category.value, timezone: fields.timezone.value, location: fields.location.value, attendeeIds: attendees.map(a => a.id), recurrence: fields.frequency.value ? { frequency: fields.frequency.value, interval: Number(fields.interval.value), count: Number(fields.count.value) } : null, ...(editing ? { revision: editing.revision } : {}) }; if (data.allDay && data.end) data.end = dateOnly(addDays(new Date(`${data.end}T12:00`), 1)); if (!editing && !pendingCreate) pendingCreate = structuredClone(data); operation(() => service.save(data), 'Event saved.'); };
  dialog.querySelector('[data-testid="event-delete"]').onclick = () => operation(() => service.remove(editing.id), 'Event deleted.');
  function updateRail() {
    const date = calendar.getDate(); const title = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); document.querySelector('.cal-month').textContent = title; document.querySelector('.cal-hero .hero-title').textContent = title;
    document.querySelector('.cal-hero .hero-sub').textContent = `${events.length} saved events · Server calendar · Shared calendar for all authenticated users. Legacy personal events remain private.`;
    const rail = document.querySelector('.cal-rail'); const first = new Date(date.getFullYear(), date.getMonth(), 1); const gridStart = addDays(first, -first.getDay());
    const upcoming = (upcomingEvents || expanded).filter(related).filter(item => eventDate(item.end) > new Date()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);
    rail.innerHTML = `<button class="cal-quickadd" data-testid="calendar-quick-add">Quick add event</button><div class="cal-rail-card"><div class="cal-rail-head"><span class="cal-rail-title">${esc(title)}</span><button class="btn" aria-label="Previous mini calendar month" data-mini-prev>‹</button><button class="btn" aria-label="Next mini calendar month" data-mini-next>›</button></div><div class="mini-cal-grid">${['S','M','T','W','T','F','S'].map(day => `<span class="mini-cal-wd">${day}</span>`).join('')}${Array.from({ length: 42 }, (_, index) => { const day = addDays(gridStart, index); return `<button class="mini-cal-day" data-day="${dateOnly(day)}" aria-label="Add event on ${dateOnly(day)}">${day.getDate()}</button>`; }).join('')}</div></div><div class="cal-rail-card"><label>Search events<input type="search" data-testid="calendar-search" value="${esc(query)}"></label></div><div class="cal-rail-card"><label>Event scope<select data-calendar-scope>${['all','related','owned','invited'].map(value => `<option value="${value}" ${scope === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><h2 class="cal-rail-title">Calendars</h2><label>Filter category<select data-testid="calendar-filter"><option value="">All categories</option>${CATEGORIES.map(category => `<option value="${category}" ${category === filter ? 'selected' : ''}>${category} (${events.filter(item => item.category === category).length})</option>`).join('')}</select></label></div><div class="cal-rail-card"><h2 class="cal-rail-title">Upcoming</h2>${upcoming.map(item => `<button class="workspace-upcoming" data-event-id="${esc(item.id)}">${esc(item.title)}<small>${esc(item.allDay ? item.start : new Date(item.start).toLocaleString())}</small></button>`).join('') || '<p>No upcoming events.</p>'}<button class="btn" data-agenda>See all events</button></div>`;
    rail.querySelector('[data-calendar-scope]').onchange = e => { scope = e.target.value; renderEvents(); updateRail(); };
    rail.querySelector('[data-testid="calendar-quick-add"]').onclick = () => open(); rail.querySelector('[data-mini-prev]').onclick = () => calendar.prev(); rail.querySelector('[data-mini-next]').onclick = () => calendar.next();
    rail.querySelectorAll('[data-day]').forEach(button => { button.onclick = () => open(null, new Date(`${button.dataset.day}T12:00`), null, true); }); rail.querySelectorAll('[data-event-id]').forEach(button => { button.onclick = () => open(events.find(item => item.id === button.dataset.eventId)); }); rail.querySelector('[data-agenda]').onclick = () => changeView('Agenda'); rail.querySelector('[data-testid="calendar-search"]').oninput = e => { query = e.target.value; renderEvents(); }; rail.querySelector('[data-testid="calendar-filter"]').onchange = event => { filter = event.target.value; renderEvents(); };
  }
  function renderEvents() { calendar.removeAllEvents(); calendar.addEventSource(expanded.filter(related).filter(item => (!filter || item.category === filter) && `${item.title} ${item.description} ${item.location || ''}`.toLowerCase().includes(query.toLowerCase())).map(item => ({ ...item, id: `${item.id}::${item.occurrence}`, editable: item.canEdit && !item.recurrence, className: `fc-cat-${item.category}`, extendedProps: { seriesId: item.id, description: item.description, category: item.category } }))); }
  async function refresh() {
    if (refreshPromise) { refreshAgain = true; return refreshPromise; }
    refreshPromise = (async () => {
      do {
        refreshAgain = false;
        const view = calendar.view;
        const snapshot = service.viewSnapshot && view?.activeStart && view?.activeEnd
          ? await service.viewSnapshot(view.activeStart.toISOString(), view.activeEnd.toISOString())
          : { series: await service.list(), events: await service.occurrences() };
        if (disposed) return;
        const next = JSON.stringify(snapshot);
        events = snapshot.series; expanded = snapshot.events; upcomingEvents = snapshot.upcoming || null;
        if (next !== fingerprint) { fingerprint = next; renderEvents(); updateRail(); }
      } while (refreshAgain && !disposed);
    })();
    try { await refreshPromise; } finally { refreshPromise = null; }
  }
  function changeView(label) { calendar.changeView({ Day: 'timeGridDay', Week: 'timeGridWeek', Month: 'dayGridMonth', Agenda: 'listWeek' }[label]); document.querySelectorAll('.cal-view-tab').forEach(button => { button.classList.toggle('is-active', button.textContent.trim() === label); button.setAttribute('aria-pressed', String(button.textContent.trim() === label)); }); }
  function localDate(date, allDay) { return allDay ? dateOnly(date) : `${dateOnly(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
  async function move(info) {
    const original = events.find(item => item.id === info.event.extendedProps.seriesId);
    try {
      if (!original || original.recurrence) throw Error('Move a non-recurring event only. Edit repeating events through the series form.');
      status.textContent = 'Saving event position…';
      const end = info.event.end || (info.event.allDay ? addDays(info.event.start, 1) : new Date(info.event.start.getTime() + (new Date(original.end) - new Date(original.start))));
      // FullCalendar Dates are browser-rendered instants; UTC avoids reinterpretation
      // in the series IANA zone, including ambiguous DST hours and date boundaries.
      await service.save({ ...original, allDay: info.event.allDay, start: info.event.allDay ? dateOnly(info.event.start) : info.event.start.toISOString(), end: info.event.allDay ? dateOnly(end) : end.toISOString(), timezone: original.timezone, attendeeIds: original.attendees.map(a => a.userId) });
      await refresh(); status.textContent = 'Event updated.';
    } catch (error) { info.revert(); status.textContent = error.message; }
  }
  try {
    if (!service.viewSnapshot) events = await service.list(); const mod = await import(/* webpackChunkName: "vendor-fullcalendar" */ './vendor-fullcalendar.js'); calendar = new mod.Calendar(host, { plugins: mod.plugins, initialView: 'dayGridMonth', headerToolbar: false, height: '100%', expandRows: true, dayMaxEvents: 3, fixedWeekCount: false, nowIndicator: true, selectable: true, editable: true, eventDisplay: 'block', datesSet: () => { if (calendar) { updateRail(); if (initialized) refresh().catch(error => { status.textContent = error.message; }); } }, dateClick: info => open(null, info.date, info.allDay ? null : new Date(info.date.getTime() + 3600000), info.allDay), select: info => { open(null, info.start, info.end, info.allDay); calendar.unselect(); }, eventClick: info => open(events.find(item => item.id === info.event.extendedProps.seriesId)), eventDrop: move, eventResize: move, dayCellDidMount: info => { info.el.dataset.testid = 'calendar-day'; info.el.dataset.date = dateOnly(info.date); }, eventDidMount: info => { info.el.dataset.testid = 'calendar-event'; info.el.dataset.eventId = info.event.id; info.el.setAttribute('aria-label', `Event: ${info.event.title}`); }, dayHeaderContent: arg => ({ html: `<span class="fc-dow">${esc(arg.text)}</span>` }) }); calendar.render(); await refresh(); initialized = true; status.textContent = 'Calendar ready.'; const params = new URLSearchParams(location.search); if (params.get('event')) { const target = events[0]; if (target) { calendar.gotoDate(target.start); open(target); } else status.textContent = 'Event unavailable or access changed. Your calendar remains available.'; } else if (params.get('new')) open(); if (params.get('view') === 'agenda') changeView('Agenda');
    document.querySelectorAll('button').forEach(button => { const label = button.textContent.trim(); if (label === 'New event') { button.dataset.testid = button.closest('.cal-toolbar') ? 'calendar-add' : 'calendar-hero-add'; button.onclick = () => open(); } if (label === 'Export') { button.dataset.testid = 'calendar-export'; button.onclick = () => exportJson('calendar.json', events); } });
    document.querySelector('.cal-main [aria-label="Previous"]').onclick = () => calendar.prev(); document.querySelector('.cal-main [aria-label="Next"]').onclick = () => calendar.next(); document.querySelector('.cal-today-btn').onclick = () => calendar.today(); document.querySelectorAll('.cal-view-tab').forEach(button => { button.onclick = () => changeView(button.textContent.trim()); }); document.querySelector('[aria-label="Filter"]').onclick = () => document.querySelector('[data-testid="calendar-filter"]').focus();
    const reset = document.createElement('button'); reset.className = 'btn'; reset.textContent = 'Reset my private calendar samples'; reset.dataset.testid = 'calendar-reset'; reset.onclick = () => operation(() => service.reset(), 'Private sample events restored for this account.'); status.before(reset);
    let syncing = false;
    const unsubscribe = service.preferences?.subscribe?.(({ state, status: preferenceStatus }) => {
      if (preferenceStatus !== 'ready') return;
      service.timezone = state.timezone; scope = state.calendarScope;
      // Existing unsaved dialogs retain the user's chosen zone and values.
      renderEvents(); updateRail();
    });
    const timer = setInterval(async () => {
      if (busy || syncing || dialog.open || document.hidden) return;
      syncing = true;
      try { await refresh(); } catch (error) { status.textContent = error.message; } finally { syncing = false; }
    }, 3000);
    const stop = () => { disposed = true; clearInterval(timer); unsubscribe?.(); };
    window.addEventListener('pagehide', stop, { once: true });
    window.addEventListener('adminator-account-changing', stop, { once: true });
  } catch (error) { status.textContent = error.message; const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = 'Retry calendar'; retry.onclick = () => location.reload(); status.after(retry); }
}
