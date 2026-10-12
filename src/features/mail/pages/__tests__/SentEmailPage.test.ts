import { describe, expect, it, vi } from 'vitest';
import Page, { generateMetadata } from '../../../../../app/(shell)/setup/sent-emails/[id]/page';

/**
 * The sent-email entry's route (04.3 UI-SPEC § Access, routing and routes): a positive integer id or
 * `notFound()`, and the STATIC document title `mail.sent_email`, so no recipient or template name
 * lands in the browser history (T-4.3-33).
 */
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('@/features/mail', () => ({ SentEmailPage: () => null }));

const params = (id: string) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve({}),
});

describe('/setup/sent-emails/[id]', () => {
  it.each(['abc', '0', '-3', '1.5', '7x'])('"%s" is not an entry page', async (id) => {
    await expect(Page(params(id))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('a positive integer renders the entry page with that id', async () => {
    const element = await Page(params('041'));
    expect(element.props).toEqual({ id: '41' });
  });

  it('the document title is the static mail.sent_email', async () => {
    expect(await generateMetadata()).toEqual({ title: 'mail.sent_email' });
  });
});
