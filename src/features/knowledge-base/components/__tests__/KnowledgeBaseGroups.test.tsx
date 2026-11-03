// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { setSession } from '@/lib/auth/session';
import * as callApiModule from '@/lib/api/call-api';
import { KnowledgeBaseGroups } from '../KnowledgeBaseGroups';
import en from '../../messages/en.json';
import * as hooks from '@/features/knowledge-base/hooks/use-knowledge-base';

const EN = en['knowledge-base'];

describe('KnowledgeBaseGroups', () => {
  beforeEach(() => {
    setSession({
      accessToken: 'test',
      csrfToken: 'test',
    });
  });

  it('renders empty state when there are no groups (Image 2)', () => {
    vi.spyOn(hooks, 'useKnowledgeBaseGroups').mockReturnValue({
      data: { data: [], meta: { total: 0, nextCursor: null, prevCursor: null } },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<KnowledgeBaseGroups />);

    expect(screen.getByRole('heading', { level: 1, name: EN.groups })).toBeDefined();
    expect(screen.getByRole('link', { name: /Articles/i })).toBeDefined();
    expect(screen.getByRole('button', { name: new RegExp(EN.new_group, 'i') })).toBeDefined();
    expect(screen.getByText(EN.no_groups_found)).toBeDefined();
  });

  it('renders table with groups when groups exist (Image 4)', () => {
    vi.spyOn(hooks, 'useKnowledgeBaseGroups').mockReturnValue({
      data: {
        data: [
          {
            id: '1',
            name: 'Duggempudi Venkateswara Reddy',
            groupSlug: 'duggempudi-venkateswara-reddy',
            description: 'Test group',
            active: true,
            color: '#28B8DA',
            groupOrder: 1,
            totalArticles: 0,
          },
        ],
        meta: { total: 1, nextCursor: null, prevCursor: null },
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<KnowledgeBaseGroups />);

    expect(screen.getByText('Duggempudi Venkateswara Reddy')).toBeDefined();
    expect(screen.getByText('0')).toBeDefined();
    expect(screen.getByRole('switch')).toBeDefined();
    expect(
      screen.getByRole('button', { name: /Edit Duggempudi Venkateswara Reddy/i }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: /Delete knowledge base Duggempudi Venkateswara Reddy/i }),
    ).toBeDefined();
  });

  it('clicking + New Group opens the modal', async () => {
    vi.spyOn(hooks, 'useKnowledgeBaseGroups').mockReturnValue({
      data: { data: [], meta: { total: 0, nextCursor: null, prevCursor: null } },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<KnowledgeBaseGroups />);

    const newGroupBtn = screen.getByRole('button', { name: new RegExp(EN.new_group, 'i') });
    await userEvent.click(newGroupBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: EN.new_group })).toBeDefined();
    });
  });

  it('renders columns with active in the middle and toggleable sorting', async () => {
    vi.spyOn(hooks, 'useKnowledgeBaseGroups').mockReturnValue({
      data: {
        data: [
          {
            id: '1',
            name: 'abcd',
            groupSlug: 'abcd',
            description: null,
            active: true,
            color: '#28B8DA',
            groupOrder: 1,
            totalArticles: 0,
          },
          {
            id: '2',
            name: 'dhjd',
            groupSlug: 'dhjd',
            description: null,
            active: true,
            color: '#637a80',
            groupOrder: 2,
            totalArticles: 0,
          },
        ],
        meta: { total: 2, nextCursor: null, prevCursor: null },
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<KnowledgeBaseGroups />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers[0]?.textContent).toContain(EN.name);
    expect(headers[0]?.className).toContain('w-[45%]');
    expect(headers[1]?.textContent).toContain(EN.active);
    expect(headers[1]?.className).toContain('w-[35%]');
    expect(headers[2]?.textContent).toContain(EN.options);
    expect(headers[2]?.className).toContain('w-[20%]');

    // Default sort is ascending ('^') showing 'abcd' then 'dhjd'
    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent).toContain('abcd');
    expect(rows[2]?.textContent).toContain('dhjd');

    // Click to sort descending ('v')
    await userEvent.click(screen.getByText(EN.name));
    const sortedRows = screen.getAllByRole('row');
    expect(sortedRows[1]?.textContent).toContain('dhjd');
    expect(sortedRows[2]?.textContent).toContain('abcd');

    // Click Active column to sort by active status (Image 2)
    await userEvent.click(screen.getByText(EN.active));
    const activeHeaderBtn = screen.getByRole('button', { name: new RegExp(EN.active, 'i') });
    const nameHeaderBtn = screen.getByRole('button', { name: new RegExp(EN.name, 'i') });
    expect(activeHeaderBtn.querySelector('.opacity-100')).not.toBeNull();
    expect(nameHeaderBtn.querySelector('.opacity-0')).not.toBeNull();
  });

  it('delete button triggers window.confirm and shows Deleted float alert on confirmation', async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    window.confirm = confirmSpy;
    const callApiSpy = vi.spyOn(callApiModule, 'callApi').mockResolvedValue({
      ok: true,
      status: 204,
      data: null,
    });
    const mutate = vi.fn();

    vi.spyOn(hooks, 'useKnowledgeBaseGroups').mockReturnValue({
      data: {
        data: [
          {
            id: '123',
            name: 'Group To Delete',
            groupSlug: 'group-to-delete',
            description: null,
            active: true,
            color: '#28B8DA',
            groupOrder: 1,
            totalArticles: 0,
          },
        ],
        meta: { total: 1, nextCursor: null, prevCursor: null },
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate,
    });

    renderWithProviders(<KnowledgeBaseGroups />);

    const deleteBtn = screen.getByRole('button', {
      name: /Delete knowledge base Group To Delete/i,
    });
    await userEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalledWith(EN.confirm_action_prompt);
    await waitFor(() => {
      expect(callApiSpy).toHaveBeenCalledWith(
        '/api/v1/knowledge-base/groups/123',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(EN.deleted)).toBeDefined();
    });
  });

  it('cancelling delete confirm does not call delete API', async () => {
    const confirmSpy = vi.fn().mockReturnValue(false);
    window.confirm = confirmSpy;
    const callApiSpy = vi.spyOn(callApiModule, 'callApi');

    vi.spyOn(hooks, 'useKnowledgeBaseGroups').mockReturnValue({
      data: {
        data: [
          {
            id: '123',
            name: 'Group To Delete',
            groupSlug: 'group-to-delete',
            description: null,
            active: true,
            color: '#28B8DA',
            groupOrder: 1,
            totalArticles: 0,
          },
        ],
        meta: { total: 1, nextCursor: null, prevCursor: null },
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<KnowledgeBaseGroups />);

    const deleteBtn = screen.getByRole('button', {
      name: /Delete knowledge base Group To Delete/i,
    });
    await userEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalledWith(EN.confirm_action_prompt);
    expect(callApiSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(EN.deleted)).toBeNull();
  });

  it('adding a new group and saving displays "Added successfully" floating alert banner', async () => {
    const trigger = vi.fn().mockResolvedValue({ ok: true, data: { id: '99' } });
    vi.spyOn(hooks, 'useCreateKnowledgeBaseGroup').mockReturnValue({
      trigger,
      isMutating: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useCreateKnowledgeBaseGroup>);

    vi.spyOn(hooks, 'useKnowledgeBaseGroups').mockReturnValue({
      data: { data: [], meta: { total: 0, nextCursor: null, prevCursor: null } },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<KnowledgeBaseGroups />);

    await userEvent.click(screen.getByRole('button', { name: new RegExp(EN.new_group, 'i') }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: EN.new_group })).toBeDefined();
    });

    const nameInput = screen.getByLabelText(new RegExp(EN.group_name, 'i'));
    await userEvent.type(nameInput, 'Brand New Group');
    await userEvent.click(screen.getByRole('button', { name: EN.save }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(EN.added_successfully)).toBeDefined();
    });
  });

  it('editing a group and saving displays "Updated successfully" floating alert banner', async () => {
    const trigger = vi.fn().mockResolvedValue({ ok: true, data: { id: '1' } });
    vi.spyOn(hooks, 'useUpdateKnowledgeBaseGroup').mockReturnValue({
      trigger,
      isMutating: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useUpdateKnowledgeBaseGroup>);

    vi.spyOn(hooks, 'useKnowledgeBaseGroups').mockReturnValue({
      data: {
        data: [
          {
            id: '1',
            name: 'Existing Group',
            groupSlug: 'existing-group',
            description: null,
            active: true,
            color: '#28B8DA',
            groupOrder: 1,
            totalArticles: 0,
          },
        ],
        meta: { total: 1, nextCursor: null, prevCursor: null },
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<KnowledgeBaseGroups />);

    await userEvent.click(screen.getByRole('button', { name: /Edit Existing Group/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: EN.edit_kb_group })).toBeDefined();
    });

    const saveBtn = screen.getByRole('button', { name: EN.save });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(EN.updated_successfully)).toBeDefined();
    });
  });
});
