import { describe, expect, it, vi } from 'vitest';
import { EmailStatusPage, EmailTemplatesListPage, SentEmailsListPage } from '@/features/mail';

/** The mail screens' list routes under Setup (04.3 UI-SPEC § Access, routing and routes), Perfex's titles. */
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('@/features/mail', () => ({
  EmailStatusPage: () => null,
  EmailTemplatesListPage: () => null,
  SentEmailsListPage: () => null,
}));

describe('/setup/email-status, /setup/email-templates and /setup/sent-emails', () => {
  it('the e-mail status page, titled email_status', async () => {
    const page = await import('../../../../../app/(shell)/setup/email-status/page');
    expect(page.default().type).toBe(EmailStatusPage);
    expect(await page.generateMetadata()).toEqual({ title: 'mail.email_status' });
  });

  it('the template list, titled email_templates', async () => {
    const page = await import('../../../../../app/(shell)/setup/email-templates/page');
    expect(page.default().type).toBe(EmailTemplatesListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'mail.email_templates' });
  });

  it('the sent e-mail log, titled sent_emails', async () => {
    const page = await import('../../../../../app/(shell)/setup/sent-emails/page');
    expect(page.default().type).toBe(SentEmailsListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'mail.sent_emails' });
  });
});
