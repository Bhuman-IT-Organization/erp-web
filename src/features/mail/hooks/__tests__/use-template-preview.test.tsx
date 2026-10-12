// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { useState } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, type FakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useTemplatePreview, type MailDraft } from '../use-template-preview';

/**
 * The preview read (D-04, choice 3): the api renders the draft of one locale, `POST
 * templates/:id/preview` through the POST read door (`usePostRead`, M7), keyed on the draft.
 */
function Probe({ initial }: { readonly initial: MailDraft | null }) {
  const [draft, setDraft] = useState(initial);
  const preview = useTemplatePreview('7', draft);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setDraft({ locale: 'en', subject: 'Template 1', message: 'Hello again' });
        }}
      >
        change
      </button>
      <output data-testid="probe">{preview.data?.subject ?? ''}</output>
    </div>
  );
}

const show = (draft: MailDraft | null) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <Probe initial={draft} />
    </SWRConfig>,
  );

let fake: FakeAdapter;
beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
  fake = fakeAdapter(200, { subject: 'Template 1 for Staff name', html: '<p>Hello</p>' });
  http.defaults.adapter = fake.adapter;
});
afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useTemplatePreview (POST templates/:id/preview)', () => {
  it('POSTs the draft of one locale and answers the rendered subject and html', async () => {
    show({ locale: 'ar', subject: 'Template 1', message: 'Hello {staff_name}' });
    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('Template 1 for Staff name');
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.method).toBe('POST');
    expect(fake.calls[0]?.url).toBe('/api/v1/mail/templates/7/preview');
    expect(fake.calls[0]?.data).toEqual({
      locale: 'ar',
      subject: 'Template 1',
      message: 'Hello {staff_name}',
    });
  });

  it('a null draft asks nothing', async () => {
    show(null);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.calls).toHaveLength(0);
  });

  it('a changed draft asks again', async () => {
    show({ locale: 'en', subject: 'Template 1', message: 'Hello' });
    await waitFor(() => {
      expect(fake.calls).toHaveLength(1);
    });
    await userEvent.click(screen.getByRole('button', { name: 'change' }));
    await waitFor(() => {
      expect(fake.calls).toHaveLength(2);
    });
    expect(fake.calls[1]?.data).toEqual({
      locale: 'en',
      subject: 'Template 1',
      message: 'Hello again',
    });
  });
});
