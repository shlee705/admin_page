import { describe, expect, it, vi } from 'vitest';
import { ResourceCalendar } from '../src/assets/scripts/2026/workspace/resources.js';

const input = { title:'Zone event', description:'', start:'2026-11-01T06:30:00Z', end:'2026-11-01T07:30:00Z', allDay:false, category:'work', timezone:'America/New_York', attendeeIds:['bob'] };
describe('Calendar creation and update request contracts', () => {
  it('forwards the stable form ID through lost response retries and preserves the chosen IANA timezone', async () => {
    const client = { request:vi.fn().mockRejectedValueOnce(Error('acknowledgement lost')).mockResolvedValue({id:'stored'}) };
    const service = new ResourceCalendar(client, {});
    const data = {...input,clientId:'form-create-id'};
    await expect(service.save(data)).rejects.toThrow('acknowledgement lost'); await service.save(data);
    const first = client.request.mock.calls[0]; expect(client.request.mock.calls[1]).toEqual(first);
    expect(first).toEqual(['/api/calendar/events',{method:'POST',body:{...input,clientId:'form-create-id'}}]);
  });
  it('keeps update CAS and removes create IDs from the update request', async () => {
    const client = {request:vi.fn().mockResolvedValue({})}; const service = new ResourceCalendar(client, {});
    service.events = [{id:'stored',revision:3}]; await service.save({...input,id:'stored',clientId:'old-create-id'});
    expect(client.request).toHaveBeenCalledExactlyOnceWith('/api/calendar/events/stored',{method:'PATCH',body:{...input,expectedRevision:3}});
  });
});
