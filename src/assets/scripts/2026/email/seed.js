import { normalizeEmail, SELF } from './model.js';

/** Fresh, deterministic samples; no mutable fixture is shared with UI. */
export function seedEmails(accountId, identity = SELF) {
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
