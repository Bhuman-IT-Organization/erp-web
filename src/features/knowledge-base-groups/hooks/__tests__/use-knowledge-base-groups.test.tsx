// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApiStatus } from '@/lib/api/api-status';
import { http } from '@/lib/api/http';
import { clearSession, setSession } from '@/lib/auth/session';
import { fakeAdapter, problem } from '@/test/axios-fakes';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import {
  useDeleteKnowledgeBaseGroup,
  useKnowledgeBaseGroup,
  useUpdateKnowledgeBaseGroupActive,
} from '../use-knowledge-base-groups';

const GROUP = {
  id: '1',
  name: 'General',
  groupSlug: 'general',
  description: 'General articles',
  active: true,
  color: '#28B8DA',
  groupOrder: 1,
  totalArticles: 0,
};

function ReadProbe({ id }: { readonly id: string | null }) {
  const { data, error } = useKnowledgeBaseGroup(id);
  return (
    <output data-testid="group" data-code={error?.code ?? ''}>
      {data?.name ?? ''}
    </output>
  );
}

function DeleteProbe({ id }: { readonly id: string }) {
  const { trigger, result } = useDeleteKnowledgeBaseGroup(id);
  return (
    <div>
      <button type="button" onClick={() => void trigger(undefined)}>
        delete
      </button>
      <output
        data-testid="delete"
        data-ok={result === undefined ? '' : String(result.ok)}
        data-code={result?.ok === false ? result.code : ''}
      />
    </div>
  );
}

function ActiveProbe({ id }: { readonly id: string }) {
  const { trigger, result } = useUpdateKnowledgeBaseGroupActive(id);
  return (
    <div>
      <button type="button" onClick={() => void trigger({ disabled: true })}>
        toggle
      </button>
      <output data-testid="active" data-ok={result === undefined ? '' : String(result.ok)} />
    </div>
  );
}

const show = (child: React.ReactNode) =>
  renderWithProviders(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{child}</SWRConfig>,
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

describe('useKnowledgeBaseGroup', () => {
  it('reads and parses GET /api/v1/knowledge-base-groups/:id', async () => {
    const reads = fakeAdapter(200, GROUP);
    http.defaults.adapter = reads.adapter;
    show(<ReadProbe id="1" />);
    expect(await screen.findByText('General')).toBeTruthy();
    expect(reads.calls.map(({ method, url }) => [method, url])).toEqual([
      ['GET', '/api/v1/knowledge-base-groups/1'],
    ]);
  });

  it('does not make a request for create and handles 404', async () => {
    const reads = fakeAdapter(404, problem(404, 'ERP-CORE-0004'));
    http.defaults.adapter = reads.adapter;
    show(<ReadProbe id={null} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads.calls).toEqual([]);

    cleanup();
    show(<ReadProbe id="99" />);
    expect((await screen.findByTestId('group')).getAttribute('data-code')).toBe('ERP-CORE-0004');
  });
});

describe('useDeleteKnowledgeBaseGroup', () => {
  it('sends a DELETE request and reports success', async () => {
    const writes = fakeAdapter(204);
    http.defaults.adapter = writes.adapter;
    show(<DeleteProbe id="1" />);
    await userEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => {
      expect(screen.getByTestId('delete').getAttribute('data-ok')).toBe('true');
    });
    expect(writes.calls.map(({ method, url, data }) => [method, url, data])).toEqual([
      ['DELETE', '/api/v1/knowledge-base-groups/1', undefined],
    ]);
  });
});

describe('useUpdateKnowledgeBaseGroupActive', () => {
  it('PATCHes group active status', async () => {
    const writes = fakeAdapter(200, { ...GROUP, active: false });
    http.defaults.adapter = writes.adapter;
    show(<ActiveProbe id="1" />);
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    await waitFor(() => {
      expect(screen.getByTestId('active').getAttribute('data-ok')).toBe('true');
    });
    expect(writes.calls.map(({ method, url, data }) => [method, url, data])).toEqual([
      ['PATCH', '/api/v1/knowledge-base-groups/1', { disabled: true }],
    ]);
  });
});
