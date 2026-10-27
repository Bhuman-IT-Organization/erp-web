// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PrioritiesForm } from '../PrioritiesForm';

const push = vi.fn();
const createPriority = vi.fn().mockResolvedValue(undefined);
const updatePriority = vi.fn().mockResolvedValue(undefined);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/hooks/useTicketPriorities', () => ({
  useTicketPriorities: () => ({
    priorities: [{ id: 5, name: 'High' }],
    loading: false,
    error: null,
    createPriority,
    updatePriority,
  }),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
});

describe('PrioritiesForm', () => {
  it('renders the create form', () => {
    render(<PrioritiesForm />);
    expect(screen.getByRole('heading', { name: 'Create Priority' })).toBeTruthy();
    expect(screen.getByLabelText('Priority Name')).toBeTruthy();
  });

  it('renders the edit form pre-filled when priorityId is provided', async () => {
    render(<PrioritiesForm priorityId={5} />);
    expect(screen.getByRole('heading', { name: 'Edit Priority' })).toBeTruthy();
    expect(await screen.findByDisplayValue('High')).toBeTruthy();
  });

  it('shows a validation error for an empty name', () => {
    render(<PrioritiesForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Priority name is required')).toBeTruthy();
    expect(createPriority).not.toHaveBeenCalled();
  });

  it('rejects a duplicate name', () => {
    render(<PrioritiesForm />);
    fireEvent.change(screen.getByLabelText('Priority Name'), { target: { value: 'high' } });
    expect(screen.getByText('This priority name already exists')).toBeTruthy();
  });

  it('submits the form successfully', async () => {
    render(<PrioritiesForm />);
    fireEvent.change(screen.getByLabelText('Priority Name'), { target: { value: 'Urgent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createPriority).toHaveBeenCalledWith({ name: 'Urgent' });
    });
    expect(push).toHaveBeenCalledWith('/setup/ticket-priorities');
  });
});
