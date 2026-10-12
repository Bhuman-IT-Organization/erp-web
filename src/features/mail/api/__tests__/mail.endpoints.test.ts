import { describe, expect, it } from 'vitest';
import {
  MAIL_ENDPOINTS,
  MAIL_ERRORS,
  MAIL_SENT_EMAILS_PATH,
  MAIL_STATUS_PATH,
  MAIL_TEMPLATES_PATH,
  NOT_FOUND_CODE,
  STALE_CODE,
  mailPaths,
} from '../mail.endpoints';

describe('mail endpoints (erp-api MAIL_ROUTES, plan 04.3-07)', () => {
  it('names the thirteen routes under /api/v1/mail with their methods', () => {
    expect(Object.keys(MAIL_ENDPOINTS)).toHaveLength(13);
    expect(Object.values(MAIL_ENDPOINTS).every((e) => e.path.startsWith('/api/v1/mail/'))).toBe(
      true,
    );
    expect(MAIL_ENDPOINTS.templateActive).toEqual({
      method: 'PUT',
      path: '/api/v1/mail/templates/:id/active',
    });
    expect(MAIL_ENDPOINTS.templatesActive).toEqual({
      method: 'POST',
      path: '/api/v1/mail/templates/active',
    });
    expect(MAIL_ENDPOINTS.save.method).toBe('PATCH');
  });

  it('keeps the three list paths', () => {
    expect(MAIL_TEMPLATES_PATH).toBe('/api/v1/mail/templates');
    expect(MAIL_SENT_EMAILS_PATH).toBe('/api/v1/mail/sent-emails');
    expect(MAIL_STATUS_PATH).toBe('/api/v1/mail/status');
  });

  it('builds each record path with the id encoded', () => {
    expect(mailPaths.template('4')).toBe('/api/v1/mail/templates/4');
    expect(mailPaths.templateActive('4')).toBe('/api/v1/mail/templates/4/active');
    expect(mailPaths.preview('4')).toBe('/api/v1/mail/templates/4/preview');
    expect(mailPaths.templateTest('4')).toBe('/api/v1/mail/templates/4/test');
    expect(mailPaths.test('9')).toBe('/api/v1/mail/tests/9');
    expect(mailPaths.sentEmail('9')).toBe('/api/v1/mail/sent-emails/9');
    expect(mailPaths.resend('9')).toBe('/api/v1/mail/sent-emails/9/resend');
    expect(mailPaths.template('a/b?c')).toBe('/api/v1/mail/templates/a%2Fb%3Fc');
    expect(mailPaths.templatesActive).toBe('/api/v1/mail/templates/active');
    expect(mailPaths.statusTest).toBe('/api/v1/mail/status/test');
  });

  it('lists the feature codes with a mail.errors message; the stale save is ERP-CORE-0013', () => {
    expect(MAIL_ERRORS.namespace).toBe('mail');
    expect(MAIL_ERRORS.codes).toEqual([
      NOT_FOUND_CODE,
      'ERP-MAIL-0002',
      'ERP-MAIL-0004',
      'ERP-MAIL-0005',
      'ERP-MAIL-0006',
      'ERP-MAIL-0007',
      'ERP-MAIL-0008',
    ]);
    expect(STALE_CODE).toBe('ERP-CORE-0013');
  });
});
