import { describe, expect, it, vi } from 'vitest';
import Page, { generateMetadata } from '../../../../../app/(shell)/setup/email-templates/[id]/page';

/**
 * The editor's route (04.3 UI-SPEC § Access, routing and routes): a positive integer id or
 * `notFound()` (the api takes nothing else), and the document title `mail.email_template`.
 */
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('@/features/mail', () => ({ EmailTemplatePage: () => null }));

const params = (id: string) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve({}),
});

describe('/setup/email-templates/[id]', () => {
  it.each(['abc', '0', '-3', '1.5', '7x'])('"%s" is not a template page', async (id) => {
    await expect(Page(params(id))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('a positive integer renders the editor page with that id', async () => {
    const element = await Page(params('007'));
    expect(element.props).toEqual({ id: '7' });
  });

  it('the document title is mail.email_template', async () => {
    expect(await generateMetadata()).toEqual({ title: 'mail.email_template' });
  });
});
