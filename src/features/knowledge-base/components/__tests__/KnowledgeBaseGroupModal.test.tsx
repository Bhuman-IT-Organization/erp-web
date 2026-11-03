// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { KnowledgeBaseGroupModal } from '../KnowledgeBaseGroupModal';
import en from '../../messages/en.json';
import * as hooks from '@/features/knowledge-base/hooks/use-knowledge-base';

const EN = en['knowledge-base'];

describe('KnowledgeBaseGroupModal', () => {
  it('renders modal with required fields matching Image 3', () => {
    renderWithProviders(<KnowledgeBaseGroupModal open={true} onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: EN.new_group })).toBeDefined();
    expect(screen.getByLabelText(new RegExp(EN.group_name, 'i'))).toBeDefined();
    expect(screen.getAllByLabelText(new RegExp(EN.color, 'i')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText(new RegExp(EN.short_description, 'i'))).toBeDefined();
    expect(screen.getByLabelText(new RegExp(EN.order, 'i'))).toBeDefined();
    expect(screen.getByLabelText(new RegExp(EN.disabled, 'i'))).toBeDefined();
    expect(screen.getByText(EN.disabled_note)).toBeDefined();
    expect(screen.getAllByRole('button', { name: EN.close }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: EN.save })).toBeDefined();
  });

  it('renders default order when passed', () => {
    renderWithProviders(<KnowledgeBaseGroupModal open={true} defaultOrder={2} onClose={vi.fn()} />);

    const orderInput = screen.getByLabelText(new RegExp(EN.order, 'i'));
    expect(orderInput.getAttribute('value')).toBe('2');
  });

  it('renders edit mode when group is passed with slug and negative order', () => {
    renderWithProviders(
      <KnowledgeBaseGroupModal
        open={true}
        group={{
          id: '1',
          name: 'dhjd',
          groupSlug: 'dhjd',
          description: 'djfnkans',
          active: true,
          color: '#637a80',
          groupOrder: -10,
          totalArticles: 0,
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: EN.edit_kb_group })).toBeDefined();
    expect(screen.getAllByDisplayValue('dhjd')).toHaveLength(2);
    expect(screen.getByLabelText(new RegExp(EN.slug, 'i'))).toBeDefined();
    expect(screen.getByDisplayValue('djfnkans')).toBeDefined();
    expect(screen.getByDisplayValue('#637a80')).toBeDefined();
    expect(screen.getByDisplayValue('-10')).toBeDefined();
  });

  it('validates required group name on submit', async () => {
    renderWithProviders(<KnowledgeBaseGroupModal open={true} onClose={vi.fn()} />);

    const saveBtn = screen.getByRole('button', { name: EN.save });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(EN.enter_group_name)).toBeDefined();
    });
  });

  it('shows required error with red border when editing and clearing group name', async () => {
    renderWithProviders(
      <KnowledgeBaseGroupModal
        open={true}
        group={{
          id: '1',
          name: 'dhjd',
          groupSlug: 'dhjd',
          description: 'djfnkans',
          active: true,
          color: '#637a80',
          groupOrder: 2,
          totalArticles: 0,
        }}
        onClose={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText(new RegExp(EN.group_name, 'i'));
    await userEvent.clear(nameInput);

    const saveBtn = screen.getByRole('button', { name: EN.save });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(EN.enter_group_name)).toBeDefined();
      expect(nameInput.className).toContain('border-destructive');
    });
  });

  it('calls update trigger on valid edit submit', async () => {
    const trigger = vi.fn().mockResolvedValue({ ok: true, data: { id: '1' } });
    vi.spyOn(hooks, 'useUpdateKnowledgeBaseGroup').mockReturnValue({
      trigger,
      isMutating: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useUpdateKnowledgeBaseGroup>);

    const onClose = vi.fn();
    renderWithProviders(
      <KnowledgeBaseGroupModal
        open={true}
        group={{
          id: '1',
          name: 'dhjd',
          groupSlug: 'dhjd',
          description: 'djfnkans',
          active: true,
          color: '#637a80',
          groupOrder: 2,
          totalArticles: 0,
        }}
        onClose={onClose}
      />,
    );

    const nameInput = screen.getByLabelText(new RegExp(EN.group_name, 'i'));
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated Group Name');

    const saveBtn = screen.getByRole('button', { name: EN.save });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(trigger).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calls create trigger on valid submit', async () => {
    const trigger = vi.fn().mockResolvedValue({ ok: true, data: { id: '10' } });
    vi.spyOn(hooks, 'useCreateKnowledgeBaseGroup').mockReturnValue({
      trigger,
      isMutating: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useCreateKnowledgeBaseGroup>);

    const onClose = vi.fn();
    renderWithProviders(<KnowledgeBaseGroupModal open={true} onClose={onClose} />);

    const nameInput = screen.getByLabelText(new RegExp(EN.group_name, 'i'));
    await userEvent.type(nameInput, 'New Support Group');

    const saveBtn = screen.getByRole('button', { name: EN.save });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(trigger).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('opens color picker popover when clicking color swatch', async () => {
    renderWithProviders(<KnowledgeBaseGroupModal open={true} onClose={vi.fn()} />);

    const trigger = screen.getByTestId('color-picker-trigger');
    await userEvent.click(trigger);

    await waitFor(() => {
      // Popover is open and saturation/hue selectors are rendered
      expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull();
    });
  });
});
