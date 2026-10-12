import { AccountPreferences, initServiceHub, applyPreferences, installDirtyGuard } from './service-hub.js';
import { initTemplatePages } from './template-pages.js';
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

import '../../styles/2026/index.scss';
import { mountShell } from './Shell.js';
import { initShellBehaviors } from './init.js';
import { initCharts } from './charts.js';
import { initVectorMaps } from './maps.js';
import { initCalendarPage } from './calendar.js';
import { initPalette } from './palette.js';
import { initializeAuthentication, renderCurrentUser } from './auth/ui.js';
import { accountEmailConfig } from './email/account-persistence.js';
import { workspaceServices } from './workspace/services.js';
import { initChatPage } from './chat.js';
import { initDashboard } from './dashboard.js';
import { initWorkspaceMenus } from './workspace/menus.js';

async function start() {
  const aliases = {'basic-table':'calendar.html?view=agenda',datatable:'tasks.html'};
  if (aliases[document.body.dataset.active]) { location.replace(aliases[document.body.dataset.active]); return; }
  const auth = await initializeAuthentication();
  if (!auth || (!auth.user && document.querySelector('.shell'))) return;
  mountShell();
  renderCurrentUser(auth);
  initShellBehaviors();
  initPalette();
  initTemplatePages();
  installDirtyGuard();
  initVectorMaps();
  let services;
  if (auth.user) {
    services = workspaceServices(auth);
    services.preferences = new AccountPreferences(auth.client);
    services.calendar.preferences = services.preferences;
    services.calendar.user = auth.user;
    services.liveChat.preferences = services.preferences;
    services.calendar.hub = services;
    services.liveChat.hub = services;
    const notice = document.createElement('div'); notice.className = 'workspace-status'; notice.dataset.testid = 'preferences-status'; notice.hidden = true;
    notice.innerHTML = '<span></span> <button class="btn" type="button" data-testid="preferences-retry">Retry preferences</button>';
    document.querySelector('main')?.before(notice);
    let hadFailure = false;
    const unsubscribe = services.preferences.subscribe(({ status, state, error }) => {
      if (status === 'ready') { applyPreferences(state); services.calendar.timezone = state.timezone; }
      if (status === 'unavailable') hadFailure = true;
      notice.hidden = status === 'ready' && !hadFailure;
      notice.setAttribute('role', status === 'unavailable' ? 'alert' : 'status');
      notice.querySelector('span').textContent = status === 'ready' ? 'Preferences recovered. Your account settings are applied.' : status === 'loading' ? 'Loading account preferences… Core features remain available.' : `Preferences unavailable: ${error?.message || 'Retry to load your account settings.'} Core features use temporary defaults or last-loaded settings; account setting saves are blocked.`;
      const retry = notice.querySelector('button'); retry.hidden = status === 'ready'; retry.disabled = status === 'loading';
    });
    notice.querySelector('button').onclick = () => services.preferences.load().catch(() => { /* feedback is rendered by the subscription */ });
    const saveTheme = async event => {
      if (!event.detail.userInitiated || services.preferences.disposed) return;
      try { await services.preferences.save({ theme: event.detail.theme }); }
      catch { /* preference status provides the retry action; never save guarded defaults */ }
    };
    window.addEventListener('adminator-theme-changed', saveTheme);
    window.addEventListener('adminator-account-changing', () => { unsubscribe(); notice.remove(); window.removeEventListener('adminator-theme-changed', saveTheme); }, { once: true });
    applyPreferences(services.preferences.state);
    services.calendar.timezone = services.preferences.state.timezone;
    // Preferences are optional for core initialization. Controllers consume the
    // same guarded state and subscribe to recovery rather than waiting for an
    // endpoint timeout before mail/calendar/tasks can become usable.
    services.preferences.load().catch(() => { /* feedback and guarded state remain available */ });
    if (services.preferences.disposed) return;
    await initServiceHub(services, auth);
    await initCalendarPage(services.calendar);
    await initChatPage(services.chat, services.liveChat);
    await initDashboard(services, auth.user);
    await initWorkspaceMenus(services);
  }
  initCharts();
  if (auth.user && document.querySelector('[data-email-app]')) {
    const { initEmailPage } = await import(/* webpackChunkName: "email-page" */ './email/ui.js');
    if (!services.preferences.disposed) await initEmailPage({ config: { ...accountEmailConfig(auth.user, auth.client, globalThis.ADMINATOR_EMAIL_CONFIG || {}), hub: services } });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
