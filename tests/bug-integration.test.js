import { describe, expect, it } from 'vitest';
import { validateMessage } from '../src/assets/scripts/2026/email/model.js';

const mail = changes => ({ to: [{ address: 'alice@adminator.test' }], cc: [], bcc: [], subject: 'Subject', bodyText: 'Body', ...changes });

describe('Integrated validation defects and unaffected boundaries', () => {
  it.each(['to', 'cc', 'bcc'])('V2 keeps the original domainless %s address in drafts', field => {
    const data = mail({ [field]: [{ address: 'user@' }] });
    expect(() => validateMessage(data)).not.toThrow();
    expect(data[field][0].address).toBe('user@');
  });
  it.each(['@example.com', 'userexample.com', 'user name@example.com', 'user@@example.com'])('V2 still rejects %s', address => {
    expect(() => validateMessage(mail({ to: [{ address }] }))).toThrow('Invalid to address');
  });
  it('V3 refuses 200 on Send, allows 199, and keeps the draft boundary independent', () => {
    expect(() => validateMessage(mail({ subject: 'S'.repeat(199) }), true)).not.toThrow();
    for (const length of [200, 201]) expect(() => validateMessage(mail({ subject: 'S'.repeat(length) }), true)).toThrow('at most 200');
    expect(() => validateMessage(mail({ subject: 'S'.repeat(200) }))).not.toThrow();
    expect(() => validateMessage(mail({ to: [] }), true)).toThrow('To recipient');
    expect(() => validateMessage(mail({ bodyText: ' ' }), true)).toThrow('Enter a message');
  });
});
