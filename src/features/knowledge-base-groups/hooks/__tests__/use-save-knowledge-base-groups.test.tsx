// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { useSaveKnowledgeBaseGroups } from '../use-save-knowledge-base-groups';

const CREATE_VALUES = {
  name: 'General',
  color: '#28B8DA',
  description: 'Desc',
  groupOrder: 1,
  disabled: false,
};

const UPDATE_VALUES = {
  name: 'General',
  groupSlug: 'general',
  color: '#28B8DA',
  description: 'Desc',
  groupOrder: 1,
  disabled: false,
};

const GROUP = {
  id: '1',
  name: 'General',
  groupSlug: 'general',
  color: '#28B8DA',
  description: 'Desc',
  groupOrder: 1,
  active: true,
  totalArticles: 0,
};

function SaveProbe({ id }: { readonly id: string | null }) {
  const { create, update } = useSaveKnowledgeBaseGroups(id);
  const mutation = id === null ? create : update;
  const values = id === null ? CREATE_VALUES : UPDATE_VALUES;
  return (
    <div>
      <button type="button" onClick={() => void mutation.trigger(values)}>
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

describe('useSaveKnowledgeBaseGroups', () => {
  it.each([
    [null, 'POST', '/api/v1/knowledge-base-groups', CREATE_VALUES],
    ['1', 'PATCH', '/api/v1/knowledge-base-groups/1', UPDATE_VALUES],
  ] as const)('sends %s to %s %s and parses response', async (id, method, url, expectedData) => {
    const writes = fakeAdapter(200, GROUP);
    http.defaults.adapter = writes.adapter;
    show(id);
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => {
      expect(screen.getByTestId('save').getAttribute('data-ok')).toBe('true');
    });
    expect(screen.getByTestId('save').textContent).toContain('General');
    expect(
      writes.calls.map(({ method: actualMethod, url: actualUrl, data }) => [
        actualMethod,
        actualUrl,
        data,
      ]),
    ).toEqual([[method, url, expectedData]]);
  });
});
