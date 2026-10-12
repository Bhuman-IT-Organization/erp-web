// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useSaveEmailTemplate } from '../use-save-email-template';

/**
 * The editor's save (ADR-0040, T-4.3-15): `PATCH templates/:id` with the record's `etag` as
 * `If-Match`; never retried (a write); a 412 answers `ERP-CORE-0013` for the form's stale path.
 */
const SAVED = {
  id: '7',
  key: 'attendance_notice',
  module: 'timesheets',
  audience: 'staff',
  active: false,
  formattingDropped: false,
  locales: ['en', 'ar'],
  mergeFields: [{ token: 'staff_name', kind: 'text' }],
  versions: { en: { subject: 'Template 1', message: 'Hello' } },
  sendTest: { configured: true, recipient: 'user@example.test' },
  etag: '"def"',
};
const BODY = {
  active: false,
  versions: { en: { subject: 'Template 1', message: 'Hello' }, ar: null },
};

function Probe() {
  const save = useSaveEmailTemplate('7');
  return (
    <button
      type="button"
      onClick={() => {
        void save.trigger(BODY, { ifMatch: '"abc"' }).then((result) => {
          document.body.dataset.result = result.ok ? result.data.etag : result.code;
        });
      }}
    >
      save
    </button>
  );
}

const show = () =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map() }}>
      <Probe />
    </SWRConfig>,
  );

let fake: FakeAdapter;
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  delete document.body.dataset.result;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useSaveEmailTemplate (PATCH templates/:id with If-Match)', () => {
  it('PATCHes Active and every version with the If-Match header and answers the saved record', async () => {
    fake = fakeAdapter(200, SAVED);
    http.defaults.adapter = fake.adapter;
    show();
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(document.body.dataset.result).toBe('"def"');
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.method).toBe('PATCH');
    expect(fake.calls[0]?.url).toBe('/api/v1/mail/templates/7');
    expect(fake.calls[0]?.headers['if-match']).toBe('"abc"');
    expect(fake.calls[0]?.data).toEqual(BODY);
  });

  it('a 412 is the stale code, sent once', async () => {
    fake = fakeAdapter(412, problem(412, 'ERP-CORE-0013'));
    http.defaults.adapter = fake.adapter;
    show();
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(document.body.dataset.result).toBe('ERP-CORE-0013');
    });
    expect(fake.calls).toHaveLength(1);
  });
});
