// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrioritiesList } from '../PrioritiesList';

const mocks = vi.hoisted(() => ({
  state: {},
  updatePriority: vi.fn(),
  deletePriority: vi.fn(),
}));

vi.mock('@/lib/hooks/useTicketPriorities', () => ({
  useTicketPriorities: () => mocks.state,
}));

const PRIORITIES = [
  { id: 3, priorityid: 3, name: 'Medium' },
  { id: 2, priorityid: 2, name: 'High' },
  { id: 1, priorityid: 1, name: 'Low' },
];

function setHook(overrides: Record<string, unknown> = {}) {
  mocks.state = {
    priorities: PRIORITIES,
    loading: false,
    error: null,
    updatePriority: mocks.updatePriority,
    deletePriority: mocks.deletePriority,
    ...overrides,
  };
}

// Names in the order they appear in the table body (skips the header row).
function namesInOrder() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent);
}

// Finds the table row whose name cell is exactly the given priority name.
function rowFor(name: string) {
  const cell = screen.getByRole('cell', { name });
  return cell.closest('tr') as HTMLElement;
}
afterEach(() => {
  cleanup();
});
describe('PrioritiesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updatePriority.mockResolvedValue(undefined);
    mocks.deletePriority.mockResolvedValue(undefined);
    setHook();
  });

  describe('states', () => {
    it('shows loading text', () => {
      setHook({ loading: true });
      render(<PrioritiesList />);
      expect(screen.getByText('Loading priorities...')).toBeInTheDocument();
    });

    it('shows the error message', () => {
      setHook({ error: 'Network down' });
      render(<PrioritiesList />);
      expect(screen.getByText('Error: Network down')).toBeInTheDocument();
    });

    it('shows the empty message', () => {
      setHook({ priorities: [] });
      render(<PrioritiesList />);
      expect(screen.getByText('No ticket priorities found.')).toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('defaults to newest first (highest id)', () => {
      render(<PrioritiesList />);
      expect(namesInOrder()).toEqual(['Medium', 'High', 'Low']);
    });

    it('cycles latest -> A-Z -> Z-A -> latest', async () => {
      const user = userEvent.setup();
      render(<PrioritiesList />);
      const toggle = screen.getByRole('button', { name: /priority name/i });

      await user.click(toggle);
      expect(namesInOrder()).toEqual(['High', 'Low', 'Medium']);

      await user.click(toggle);
      expect(namesInOrder()).toEqual(['Medium', 'Low', 'High']);

      await user.click(toggle);
      expect(namesInOrder()).toEqual(['Medium', 'High', 'Low']);
    });
  });

  describe('delete', () => {
    it('shows inline confirmation, then deletes on Yes', async () => {
      const user = userEvent.setup();
      render(<PrioritiesList />);

      // First row is id 3 (Medium) because of the default sort.
      const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
      if (!deleteButtons[0]) throw new Error('Delete button not found');

      await user.click(deleteButtons[0]);
      expect(screen.getByText('Delete this priority?')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^yes$/i }));

      expect(mocks.deletePriority).toHaveBeenCalledWith(3);
      expect(screen.queryByText('Delete this priority?')).not.toBeInTheDocument();
    });

    it('cancels on No without deleting', async () => {
      const user = userEvent.setup();
      render(<PrioritiesList />);

      const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
      if (!deleteButtons[0]) throw new Error('Delete button not found');

      await user.click(deleteButtons[0]);
      await user.click(screen.getByRole('button', { name: /^no$/i }));

      expect(mocks.deletePriority).not.toHaveBeenCalled();
      expect(screen.queryByText('Delete this priority?')).not.toBeInTheDocument();
    });

    it('shows an error and keeps the confirmation when delete fails', async () => {
      mocks.deletePriority.mockRejectedValueOnce(new Error('Cannot delete'));
      const user = userEvent.setup();
      render(<PrioritiesList />);

      const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
      if (!deleteButtons[0]) throw new Error('Delete button not found');

      await user.click(deleteButtons[0]);
      await user.click(screen.getByRole('button', { name: /^yes$/i }));

      expect(await screen.findByText('Cannot delete')).toBeInTheDocument();
      expect(screen.getByText('Delete this priority?')).toBeInTheDocument();
    });
  });

  describe('edit', () => {
    it('saves a new name with the Save button', async () => {
      const user = userEvent.setup();
      render(<PrioritiesList />);

      await user.click(within(rowFor('Medium')).getByRole('button', { name: /^edit$/i }));
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('Medium');

      await user.clear(input);
      await user.type(input, 'Urgent');
      await user.click(screen.getByRole('button', { name: /^save$/i }));

      expect(mocks.updatePriority).toHaveBeenCalledWith(3, { name: 'Urgent' });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('saves with Enter and trims whitespace', async () => {
      const user = userEvent.setup();
      render(<PrioritiesList />);

      await user.click(within(rowFor('Low')).getByRole('button', { name: /^edit$/i }));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, '  Minor  {enter}');

      expect(mocks.updatePriority).toHaveBeenCalledWith(1, { name: 'Minor' });
    });

    it('cancels with Escape', async () => {
      const user = userEvent.setup();
      render(<PrioritiesList />);

      await user.click(within(rowFor('Low')).getByRole('button', { name: /^edit$/i }));
      await user.type(screen.getByRole('textbox'), 'xyz{escape}');

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(mocks.updatePriority).not.toHaveBeenCalled();
    });

    it('cancels with the Cancel button', async () => {
      const user = userEvent.setup();
      render(<PrioritiesList />);

      await user.click(within(rowFor('Low')).getByRole('button', { name: /^edit$/i }));
      await user.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(mocks.updatePriority).not.toHaveBeenCalled();
    });

    it('does not call update when the name is unchanged', async () => {
      const user = userEvent.setup();
      render(<PrioritiesList />);

      await user.click(within(rowFor('Low')).getByRole('button', { name: /^edit$/i }));
      await user.click(screen.getByRole('button', { name: /^save$/i }));

      expect(mocks.updatePriority).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('disables Save for an empty name', async () => {
      const user = userEvent.setup();
      render(<PrioritiesList />);

      await user.click(within(rowFor('Low')).getByRole('button', { name: /^edit$/i }));
      await user.clear(screen.getByRole('textbox'));

      expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    });

    it('disables Save for a duplicate name', async () => {
      const user = userEvent.setup();
      render(<PrioritiesList />);

      await user.click(within(rowFor('Low')).getByRole('button', { name: /^edit$/i }));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'High');

      expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    });

    it('shows an error and stays in edit mode when update fails', async () => {
      mocks.updatePriority.mockRejectedValueOnce(new Error('Update failed'));
      const user = userEvent.setup();
      render(<PrioritiesList />);

      await user.click(within(rowFor('Low')).getByRole('button', { name: /^edit$/i }));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'Minor');
      await user.click(screen.getByRole('button', { name: /^save$/i }));

      expect(await screen.findByText('Update failed')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });
});
