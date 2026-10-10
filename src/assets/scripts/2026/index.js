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
import { initEmailPage } from './email/ui.js';
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
