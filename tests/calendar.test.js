import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initCalendarPage } from '../src/assets/scripts/2026/calendar.js';

const mock = vi.hoisted(() => ({ instance: null }));
vi.mock('../src/assets/scripts/2026/vendor-fullcalendar.js', () => ({
  plugins: [],
  Calendar: class {
    constructor(_host, options) { this.options = options; this.view = {activeStart:new Date('2030-01-01T00:00:00Z'),activeEnd:new Date('2030-02-01T00:00:00Z')}; mock.instance = this; }
    getDate() { return new Date('2030-01-01T12:00:00'); }
    render() {}
    removeAllEvents() { this.events = []; }
    addEventSource(events) { this.events = events; }
    unselect() {}
  },
}));

let service;
const item = (id, ownerId, category, attendees = []) => ({ id, ownerId, category, attendees, title: id, description: '', start: '2030-01-02T09:00:00Z', end: '2030-01-02T10:00:00Z', allDay: false, timezone: 'UTC', occurrence: 0, revision: 1, canEdit: true });
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn(function () { this.open = true; }) });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn(function () { this.open = false; this.dispatchEvent(new Event('close')); }) });
  document.body.innerHTML = '<div class="cal-hero"><h1 class="hero-title"></h1><p class="hero-sub"></p></div><span class="cal-month"></span><aside class="cal-rail"></aside><div class="cal-main"><button aria-label="Previous"></button><button aria-label="Next"></button><button class="cal-today-btn"></button><button aria-label="Filter"></button><div class="cal-toolbar"><button>New event</button></div><div data-fc></div></div>';
  const events = [item('mine-work', 'alice', 'work'), item('mine-team', 'alice', 'team'), item('invited', 'bob', 'work', [{ userId: 'alice', displayName: 'Alice', status: 'pending' }]), item('unrelated', 'bob', 'team')];
  service = { user: { id: 'alice' }, timezone: 'UTC', preferences: { state: { calendarScope: 'all' } }, list: vi.fn(async () => events), occurrences: vi.fn(async () => events), save: vi.fn(async () => {}), remove: vi.fn(async () => {}), respond: vi.fn(), searchUsers: vi.fn() };
});
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.useRealTimers(); });
const select = (selector, value) => { const node = document.querySelector(selector); node.value = value; node.dispatchEvent(new Event('change')); };
const shown = () => mock.instance.events.map(e => e.title);

describe('Calendar page regressions', () => {
  it('uses view bounds and avoids rebuilding unchanged polling results', async () => {
    const series = await service.list();
    service.viewSnapshot = vi.fn(async()=>({series,events:series,upcoming:[series[0]]}));
    await initCalendarPage(service);
    expect(service.viewSnapshot).toHaveBeenCalledExactlyOnceWith('2030-01-01T00:00:00.000Z','2030-02-01T00:00:00.000Z');
    expect(service.occurrences).not.toHaveBeenCalled();
    const render = vi.spyOn(mock.instance,'removeAllEvents');
    await vi.advanceTimersByTimeAsync(3000);
    expect(render).not.toHaveBeenCalled();
    mock.instance.options.datesSet(); await vi.advanceTimersByTimeAsync(0);
    expect(service.viewSnapshot).toHaveBeenCalledTimes(3);
  });
  it('retains the same create request and input after a lost response, and starts a new ID for a deliberate new form', async () => {
    service.save.mockRejectedValueOnce(Error('Response lost')).mockResolvedValue({id:'saved'});
    await initCalendarPage(service);
    document.querySelector('[data-testid="calendar-add"]').click();
    document.querySelector('[name="title"]').value = 'Retry this event';
    const submit = () => document.querySelector('dialog form').dispatchEvent(new Event('submit', {cancelable:true}));
    submit();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="event-error"]').textContent).toContain('retry'));
    expect(document.querySelector('dialog').open).toBe(true);
    expect(document.querySelector('[name="title"]').value).toBe('Retry this event');
    const first = service.save.mock.calls[0][0];
    expect(first.clientId).toBeTruthy();
    submit();
    await vi.waitFor(() => expect(service.save).toHaveBeenCalledTimes(2));
    expect(service.save.mock.calls[1][0]).toEqual(first);
    await vi.waitFor(() => expect(document.querySelector('dialog').open).toBe(false));
    await vi.waitFor(() => expect(document.querySelector('[name="title"]').disabled).toBe(false));
    document.querySelector('[data-testid="calendar-add"]').click();
    document.querySelector('[name="title"]').value = 'A new event'; submit();
    await vi.waitFor(() => expect(service.save).toHaveBeenCalledTimes(3));
    expect(service.save.mock.calls[2][0].clientId).not.toBe(first.clientId);
  });
  it('offers the original immutable request after uncertain create failure even when the user edits the form', async () => {
    service.save.mockRejectedValueOnce(Error('Response lost')).mockResolvedValue({id:'saved'});
    await initCalendarPage(service); document.querySelector('[data-testid="calendar-add"]').click();
    document.querySelector('[name="title"]').value='Original event';
    document.querySelector('dialog form').dispatchEvent(new Event('submit',{cancelable:true}));
    await vi.waitFor(() => expect(document.querySelector('[data-testid="event-retry-create"]')).not.toBeNull());
    document.querySelector('[name="title"]').value='Changed unsaved title';
    document.querySelector('[data-testid="event-retry-create"]').click();
    await vi.waitFor(() => expect(service.save).toHaveBeenCalledTimes(2));
    expect(service.save.mock.calls[1][0]).toEqual(service.save.mock.calls[0][0]);
  });
  it('applies recovered Calendar preferences without replacing an unsaved dialog, and unsubscribes on account change', async () => {
    let listener; const unsubscribe=vi.fn(); service.preferences.subscribe=vi.fn(callback=>{listener=callback;return unsubscribe;});
    await initCalendarPage(service); document.querySelector('[data-testid="calendar-add"]').click();
    document.querySelector('[name="title"]').value='Keep my input';
    listener({status:'ready',state:{timezone:'America/New_York',calendarScope:'owned'}});
    expect(service.timezone).toBe('America/New_York'); expect(shown()).toEqual(['mine-work','mine-team']);
    expect(document.querySelector('[data-calendar-scope]').value).toBe('owned');
    expect(document.querySelector('[name="timezone"]').value).toBe('UTC'); expect(document.querySelector('[name="title"]').value).toBe('Keep my input');
    window.dispatchEvent(new Event('adminator-account-changing')); expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it.each(['eventDrop','eventResize'])('preserves the original IANA timezone and exact instant on %s across browser zones', async action => {
    const original = {...item('zone-event','alice','work'),timezone:'America/New_York',start:'2026-11-01T05:30:00Z',end:'2026-11-01T06:30:00Z'};
    service.list.mockResolvedValue([original]); service.occurrences.mockResolvedValue([original]);
    await initCalendarPage(service);
    const info = {event:{extendedProps:{seriesId:original.id},allDay:false,start:new Date('2026-11-01T06:30:00Z'),end:new Date('2026-11-01T07:30:00Z')},revert:vi.fn()};
    await mock.instance.options[action](info);
    expect(service.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({timezone:'America/New_York',start:'2026-11-01T06:30:00.000Z',end:'2026-11-01T07:30:00.000Z',revision:1}));
    expect(info.revert).not.toHaveBeenCalled();
  });
  it('keeps all-day exclusive dates and zone on drag, and rejects occurrence dragging', async () => {
    const original = {...item('day-event','alice','work'),timezone:'Pacific/Auckland',start:'2030-01-02',end:'2030-01-04',allDay:true};
    service.list.mockResolvedValue([original]); service.occurrences.mockResolvedValue([original]);
    await initCalendarPage(service);
    const info = {event:{extendedProps:{seriesId:original.id},allDay:true,start:new Date(2030,0,3),end:new Date(2030,0,5)},revert:vi.fn()};
    await mock.instance.options.eventDrop(info);
    expect(service.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({timezone:'Pacific/Auckland',start:'2030-01-03',end:'2030-01-05',allDay:true}));
    original.recurrence = {frequency:'weekly',count:3};
    service.save.mockClear(); await mock.instance.options.eventDrop(info);
    expect(service.save).not.toHaveBeenCalled(); expect(info.revert).toHaveBeenCalledOnce();
  });
  it('keeps exact timed instants across UTC midnight and a distant IANA date boundary', async () => {
    const original = {...item('boundary','alice','travel'),timezone:'Pacific/Kiritimati',start:'2030-01-01T23:00:00Z',end:'2030-01-02T00:00:00Z'};
    service.list.mockResolvedValue([original]); service.occurrences.mockResolvedValue([original]);
    await initCalendarPage(service);
    await mock.instance.options.eventResize({event:{extendedProps:{seriesId:original.id},allDay:false,start:new Date('2030-01-01T23:30:00Z'),end:new Date('2030-01-02T01:00:00Z')},revert:vi.fn()});
    expect(service.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({timezone:'Pacific/Kiritimati',start:'2030-01-01T23:30:00.000Z',end:'2030-01-02T01:00:00.000Z'}));
  });
  it('closes a committed create even when refreshing fails, preventing accidental resubmission', async () => {
    await initCalendarPage(service);
    document.querySelector('[data-testid="calendar-add"]').click();
    document.querySelector('[name="title"]').value = 'Committed';
    service.list.mockRejectedValue(Error('Refresh offline'));
    document.querySelector('dialog form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('[data-testid="calendar-status"]').textContent).toBe('Event saved. Refresh failed: Refresh offline'));
    expect(document.querySelector('dialog').open).toBe(false);
    expect(service.save).toHaveBeenCalledTimes(1);
  });
  it('keeps scope and category handlers independent after rail reconstruction', async () => {
    await initCalendarPage(service);
    select('[data-calendar-scope]', 'owned');
    expect(shown()).toEqual(['mine-work', 'mine-team']);
    select('[data-testid="calendar-filter"]', 'team');
    expect(shown()).toEqual(['mine-team']);
    select('[data-calendar-scope]', 'all');
    expect(shown()).toEqual(['mine-team', 'unrelated']);
    select('[data-testid="calendar-filter"]', '');
    select('[data-calendar-scope]', 'invited');
    expect(shown()).toEqual(['invited']);
    select('[data-calendar-scope]', 'related');
    expect(shown()).toEqual(['mine-work', 'mine-team', 'invited']);
  });
  it('creates, opens, updates and deletes through one handler per action', async () => {
    await initCalendarPage(service);
    mock.instance.options.select({ start: new Date('2030-01-02'), end: new Date('2030-01-03'), allDay: true });
    document.querySelector('[name="title"]').value = 'New';
    document.querySelector('dialog form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(service.save).toHaveBeenCalledTimes(1));
    expect(service.save.mock.calls[0][0]).toMatchObject({ title: 'New', start: '2030-01-02', end: '2030-01-03', allDay: true });
    await vi.waitFor(() => expect(document.querySelector('dialog').open).toBe(false));
    await vi.waitFor(() => expect(document.querySelector('[name="title"]').disabled).toBe(false));
    mock.instance.options.eventClick({ event: { extendedProps: { seriesId: 'mine-work' } } });
    document.querySelector('[name="title"]').value = 'Changed';
    document.querySelector('dialog form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(service.save).toHaveBeenCalledTimes(2));
    expect(service.save.mock.calls[1][0]).toMatchObject({ id: 'mine-work', title: 'Changed', revision: 1 });
    await vi.waitFor(() => expect(document.querySelector('dialog').open).toBe(false));
    await vi.waitFor(() => expect(document.querySelector('[name="title"]').disabled).toBe(false));
    mock.instance.options.eventClick({ event: { extendedProps: { seriesId: 'mine-work' } } });
    document.querySelector('[data-testid="event-delete"]').click();
    await vi.waitFor(() => expect(service.remove).toHaveBeenCalledExactlyOnceWith('mine-work'));
  });
  it('does not enable private invitee fields after a failed RSVP', async () => {
    service.list.mockResolvedValue([ { ...item('private', 'bob', 'work', [{ userId: 'alice' }]), canEdit: false } ]);
    service.respond.mockRejectedValue(Error('Offline'));
    await initCalendarPage(service);
    mock.instance.options.eventClick({ event: { extendedProps: { seriesId: 'private' } } });
    document.querySelector('[data-rsvp="accepted"]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="event-error"]').textContent).toBe('Offline'));
    expect(document.querySelector('[name="title"]').disabled).toBe(true);
    expect(document.querySelector('[data-testid="event-save"]').hidden).toBe(true);
  });
  it('discards attendee search results belonging to a previous dialog', async () => {
    let resolve;
    service.searchUsers.mockReturnValue(new Promise(done => { resolve = done; }));
    await initCalendarPage(service);
    document.querySelector('[data-testid="calendar-add"]').click();
    const input = document.querySelector('[name="attendeeSearch"]'); input.value = 'bob'; input.dispatchEvent(new Event('input'));
    document.querySelector('[data-testid="event-cancel"]').click();
    document.querySelector('[data-testid="calendar-add"]').click();
    resolve({ users: [{ id: 'bob', displayName: 'Bob', username: 'bob' }] });
    await Promise.resolve();
    expect(document.querySelector('[data-add-attendee]')).toBeNull();
  });
});
