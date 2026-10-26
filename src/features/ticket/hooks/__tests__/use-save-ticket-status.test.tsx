// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useSaveTicketStatuses } from '../use-save-ticket-status';

const VALUES = { name: 'Waiting', statuscolor: '#a1b2c3', statusorder: 2 };
const STATUS = {
  ticketstatusid: '7',
  ...VALUES,
  isdefault: 0,
};

function SaveProbe({ id }: { readonly id: string | null }) {
  const { create, update } = useSaveTicketStatuses(id);
  const mutation = id === null ? create : update;
  return (
    <div>
      <button type="button" onClick={() => void mutation.trigger(VALUES)}>
        save
      </button>
      <output
        data-testid="save"
        data-ok={mutation.result === undefined ? '' : String(mutation.result.ok)}
      >
        {mutation.result?.ok ? mutation.result.data.name : ''}
      </output>
    </div>
  );
}

const show = (id: string | null) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <SaveProbe id={id} />
    </SWRConfig>,
  );

beforeEach(() => {
  setSession({ accessToken: 'test', csrfToken: 'test' });
  resetApiStatus();
});

afterEach(() => {
  cleanup();
  clearSession();
  delete http.defaults.adapter;
});

describe('useSaveTicketStatuses', () => {
  it.each([
    [null, 'POST', '/api/v1/ticket-statuses'],
    ['7', 'PATCH', '/api/v1/ticket-statuses/7'],
  ] as const)('sends %s to %s %s and parses the saved status', async (id, method, url) => {
    const writes = fakeAdapter(200, STATUS);
    http.defaults.adapter = writes.adapter;
    show(id);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(screen.getByTestId('save').getAttribute('data-ok')).toBe('true');
    });
    expect(screen.getByTestId('save').textContent).toContain('Waiting');
    expect(
      writes.calls.map(({ method: actualMethod, url: actualUrl, data }) => [
        actualMethod,
        actualUrl,
        data,
      ]),
    ).toEqual([[method, url, VALUES]]);
  });
});
