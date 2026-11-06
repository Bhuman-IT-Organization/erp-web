// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useSaveAnnouncements } from '../use-save-announcements';

const ITEM = {
  id: 'a1',
  name: 'Downtime',
  message: 'The system is down tonight.',
  dateAdded: '2026-10-31T09:00:00.000Z',
  showToUsers: true,
  showToStaff: false,
  showName: true,
};
const BODY = {
  name: 'Downtime',
  message: 'The system is down tonight.',
  showtousers: true,
  showtostaff: false,
  showname: true,
};
function Probe({ id }: { readonly id: string | null }) {
  const { create, update } = useSaveAnnouncements(id);
  const mutation = id === null ? create : update;
  return (
    <>
      <button type="button" onClick={() => void mutation.trigger(BODY)}>
        save
      </button>
      <output
        data-testid="save"
        data-ok={mutation.result === undefined ? '' : String(mutation.result.ok)}
        data-code={mutation.result?.ok === false ? mutation.result.code : ''}
      >
        {mutation.result?.ok === true ? mutation.result.data.name : ''}
      </output>
    </>
  );
}
const show = (id: string | null) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <Probe id={id} />
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

describe('useSaveAnnouncements', () => {
  it('POSTs the create body to the collection', async () => {
    const writes = fakeAdapter(201, ITEM);
    http.defaults.adapter = writes.adapter;
    show(null);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByText('Downtime')).toBeTruthy();
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['POST', '/api/v1/announcements', BODY],
    ]);
  });
  it('PATCHes an edit path and does not invalidate the list', async () => {
    const writes = fakeAdapter(200, ITEM);
    http.defaults.adapter = writes.adapter;
    show('a1');
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await screen.findByText('Downtime');
    expect(writes.calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['PATCH', '/api/v1/announcements/a1', BODY],
    ]);
  });
  it('does not retry a server failure', async () => {
    const writes = fakeAdapter(503, problem(503, 'ERP-UPSTREAM-0001'));
    http.defaults.adapter = writes.adapter;
    show(null);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(screen.getByTestId('save').getAttribute('data-code')).toBe('ERP-UPSTREAM-0001');
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(writes.calls).toHaveLength(1);
  });
});
