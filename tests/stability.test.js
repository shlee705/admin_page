import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountShell } from '../src/assets/scripts/2026/Shell.js';
import { initShellBehaviors } from '../src/assets/scripts/2026/init.js';
import { open, close } from '../src/assets/scripts/2026/palette.js';
import { AccountPreferences, applyPreferences } from '../src/assets/scripts/2026/service-hub.js';
import { initTemplatePages } from '../src/assets/scripts/2026/template-pages.js';
import { initDashboard } from '../src/assets/scripts/2026/dashboard.js';

const actual = { timezone: 'UTC', theme: 'dark', calendarScope: 'owned', mailAutoRefresh: false, homeCards: ['mail'], favoriteRooms: ['room'] };

describe('QA-005/006/010 stability regressions', () => {
  beforeEach(() => {
    document.body.dataset.active = 'dashboard';
    document.body.innerHTML = '<div data-shell-sidebar></div><div data-shell-topbar></div><main class="content"></main>';
    document.documentElement.dataset.theme = 'light';
  });

  it('palette theme command toggles once through the same action as the topbar', () => {
    mountShell(); initShellBehaviors();
    const changed = vi.fn(); window.addEventListener('adminator-theme-changed', changed);
    try {
      open(); const input = document.querySelector('.palette-input');
      input.value = 'Toggle theme'; input.dispatchEvent(new Event('input'));
      document.querySelector('.palette-result').click();
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(localStorage.getItem('dash26-theme')).toBe('dark');
      expect(changed).toHaveBeenCalledTimes(1);
      document.querySelector('#themeToggle').click();
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(changed).toHaveBeenCalledTimes(2);
    } finally { close(); window.removeEventListener('adminator-theme-changed', changed); }
  });

  it('programmatic preferences update theme/icon/charts notification without a user save action', () => {
    mountShell(); initShellBehaviors();
    const changed = vi.fn(); window.addEventListener('adminator-theme-changed', changed);
    try {
      applyPreferences(actual);
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(document.querySelector('#themeToggle svg circle')).toBeTruthy();
      expect(changed).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ theme: 'dark', userInitiated: false }) }));
    } finally { window.removeEventListener('adminator-theme-changed', changed); }
  });

  it('preferences failure keeps guarded defaults available to core features and prevents writes', async () => {
    const client = { request: vi.fn().mockRejectedValue(Error('Preferences unavailable')) };
    const prefs = new AccountPreferences(client);
    try {
      await expect(prefs.load()).rejects.toThrow('Preferences unavailable');
      expect(prefs.state).toEqual(expect.objectContaining({ timezone: 'Asia/Seoul', mailAutoRefresh: true, homeCards: ['calendar', 'tasks', 'mail', 'chat'] }));
      expect(prefs.available).toBe(false);
      await expect(prefs.save({ theme: 'light' })).rejects.toThrow(/unavailable/i);
      expect(client.request).toHaveBeenCalledTimes(1);
    } finally { prefs.dispose?.(); }
  });

  it('successful retry restores actual preferences and notifies existing controllers', async () => {
    const client = { request: vi.fn().mockRejectedValueOnce(Error('503')).mockResolvedValue({ preferences: actual, revision: 8 }) };
    const prefs = new AccountPreferences(client);
    try {
      await expect(prefs.load()).rejects.toThrow('503');
      const listener = vi.fn(); const unsubscribe = prefs.subscribe(listener);
      await prefs.load();
      expect(prefs.available).toBe(true); expect(prefs.state).toEqual(actual);
      expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ state: actual, status: 'ready', source: 'load', recovered: true }));
      await prefs.save({ theme: 'light' });
      expect(client.request).toHaveBeenLastCalledWith('/api/preferences', expect.objectContaining({ body: { preferences: { ...actual, theme: 'light' }, expectedRevision: 8 } }));
      unsubscribe();
    } finally { prefs.dispose?.(); }
  });

  it('late preference response cannot replace state or notify after account disposal', async () => {
    let resolve; const client = { request: vi.fn().mockImplementation(() => new Promise(done => { resolve = done; })) };
    const prefs = new AccountPreferences(client); const listener = vi.fn();
    try {
      prefs.subscribe(listener); const pending = prefs.load(); const temporary = prefs.state;
      window.dispatchEvent(new Event('adminator-account-changing'));
      resolve({ preferences: actual, revision: 8 }); await pending;
      expect(prefs.state).toBe(temporary); expect(prefs.available).toBe(false);
      expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }));
      await expect(prefs.save({ theme: 'dark' })).rejects.toThrow(/account|disposed/i);
    } finally { prefs.dispose?.(); }
  });

  it('serialized preference saves preserve unrelated settings and increment CAS revisions', async () => {
    let state = { ...actual }; let revision = 8;
    const client = { request: vi.fn().mockImplementation(async (path, options) => {
      if (options) { expect(options.body.expectedRevision).toBe(revision); state = options.body.preferences; revision++; }
      return { preferences: state, revision };
    }) };
    const prefs = new AccountPreferences(client);
    try {
      await prefs.load(); await Promise.all([prefs.save({ theme: 'light' }), prefs.save({ timezone: 'Asia/Seoul' })]);
      expect(prefs.state).toEqual({ ...actual, theme: 'light', timezone: 'Asia/Seoul' }); expect(prefs.revision).toBe(10);
    } finally { prefs.dispose(); }
  });

  it('Home recovery updates timezone/cards while preserving an unsaved task even if its card is hidden', async () => {
    const client = { request: vi.fn().mockImplementation(async path => path === '/api/preferences' ? { preferences: actual, revision: 8 } : path === '/api/attention' ? { items: [] } : { todayEvents: [], upcomingEvents: [], recentMail: [], recentChats: [], unreadEmail: 0, unreadChat: 0 }) };
    const preferences = new AccountPreferences(client);
    try {
      await initDashboard({ client, preferences, tasks: { state: { tasks: [] }, load: async () => {} } }, { displayName: 'Tester' });
      document.querySelector('[data-home-task-form] input').value = 'Keep this draft';
      await preferences.load();
      await vi.waitFor(() => expect(document.querySelector('[data-testid="dashboard-status"]').textContent).toContain('UTC'));
      expect(document.querySelector('[data-home-card="mail"]')).toBeTruthy();
      expect(document.querySelector('[data-home-card="calendar"]')).toBeNull();
      expect(document.querySelector('[data-home-task-form] input').value).toBe('Keep this draft');
    } finally { window.dispatchEvent(new Event('adminator-account-changing')); preferences.dispose(); }
  });

  it('charts compatibility path uses Reports active menu and breadcrumb without changing URL', () => {
    document.body.dataset.active = 'charts'; document.body.dataset.crumbs = 'Workspace | Charts';
    mountShell();
    expect(document.querySelector('.nav-link.is-active')?.getAttribute('href')).toBe('reports.html');
    expect(document.querySelector('.crumbs .current').textContent).toBe('Work report');
  });

  it('business compatibility aliases cannot execute unreachable legacy gallery controllers', () => {
    for (const key of ['charts', 'forms', 'blank', 'basic-table', 'datatable']) {
      document.body.dataset.active = key; document.body.innerHTML = '<main><section class="hero"></section></main>';
      expect(() => initTemplatePages()).not.toThrow();
      expect(document.querySelector('[data-testid="template-mode"]')).toBeNull();
    }
  });
});
