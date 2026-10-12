// @vitest-environment happy-dom
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { SaveBar, type SaveBarProps } from '../SaveBar';

const COMMON = commonEn.common;
const SUBMIT = 'Save staff member';
const PENDING = 'Saving staff member…';

function bar(extra: Partial<SaveBarProps> = {}): SaveBarProps {
  return {
    formId: 'member',
    dirty: false,
    submitLabel: SUBMIT,
    pendingLabel: PENDING,
    isPending: false,
    onBack: vi.fn(),
    ...extra,
  };
}

const submit = (name = SUBMIT): HTMLButtonElement =>
  screen.getByRole<HTMLButtonElement>('button', { name });

describe('SaveBar (UI-SPEC § Sticky save bar)', () => {
  it('is sticky at the bottom, 68 px, with a top border on the background fill', () => {
    renderWithProviders(<SaveBar {...bar()} />);
    expect(screen.getByTestId('save-bar').className.split(' ')).toEqual(
      expect.arrayContaining(['sticky', 'bottom-0', 'border-t', 'bg-background', 'px-6', 'py-4']),
    );
  });

  it('the two buttons wrap onto a second line rather than push the page sideways (375: "Discard changes" beside "Save expense category custom fields")', () => {
    renderWithProviders(<SaveBar {...bar()} />);
    expect(submit().parentElement?.className.split(' ')).toContain('flex-wrap');
  });

  it('clean: no "Unsaved changes" and the submit disabled', () => {
    renderWithProviders(<SaveBar {...bar()} />);
    expect(screen.queryByText(COMMON.unsaved_changes)).toBeNull();
    expect(submit().disabled).toBe(true);
  });

  it('dirty: "Unsaved changes" and the submit enabled', () => {
    renderWithProviders(<SaveBar {...bar({ dirty: true })} />);
    expect(screen.getByText(COMMON.unsaved_changes)).toBeDefined();
    expect(submit().disabled).toBe(false);
  });

  it('pending: the submit reads the pending label and both buttons are disabled', () => {
    renderWithProviders(<SaveBar {...bar({ dirty: true, isPending: true })} />);
    expect(submit(PENDING).disabled).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: COMMON.back_to_list }).disabled,
    ).toBe(true);
  });

  it('the submit is type="submit" and names its form, so it can sit outside the <form> body', () => {
    renderWithProviders(<SaveBar {...bar({ dirty: true })} />);
    expect(submit().getAttribute('type')).toBe('submit');
    expect(submit().getAttribute('form')).toBe('member');
  });

  it('"Back to list" calls onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderWithProviders(<SaveBar {...bar({ onBack })} />);
    await user.click(screen.getByRole('button', { name: COMMON.back_to_list }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('readOnly hides the submit and keeps "Back to list"', () => {
    renderWithProviders(<SaveBar {...bar({ readOnly: true, dirty: true })} />);
    expect(screen.queryByRole('button', { name: SUBMIT })).toBeNull();
    expect(screen.getByRole('button', { name: COMMON.back_to_list })).toBeDefined();
  });

  it('backLabel replaces "Back to list" (K11: an editable table says "Discard changes")', async () => {
    const onBack = vi.fn();
    renderWithProviders(<SaveBar {...bar({ onBack, backLabel: COMMON.discard_changes })} />);
    expect(screen.queryByRole('button', { name: COMMON.back_to_list })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: COMMON.discard_changes }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('countLabel shows at the inline start while dirty instead of "Unsaved changes"; nothing while clean', () => {
    const { unmount } = renderWithProviders(
      <SaveBar {...bar({ dirty: true, countLabel: '3 rows changed' })} />,
    );
    expect(screen.getByText('3 rows changed').className).toContain('me-auto');
    expect(screen.queryByText(COMMON.unsaved_changes)).toBeNull();
    unmount();
    renderWithProviders(<SaveBar {...bar({ countLabel: '3 rows changed' })} />);
    expect(screen.queryByText('3 rows changed')).toBeNull();
  });

  describe('secondarySubmit (opt-in, 04.6-14: two-submit forms)', () => {
    const DRAFT = { name: 'draft', label: 'Save draft', pendingLabel: 'Saving draft…' };

    /** A screen: a submit press makes the save pending, as the form's onValid does. */
    function Pending(): ReactElement {
      const [pending, setPending] = useState(false);
      return (
        <form
          id="member"
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
          }}
        >
          <SaveBar {...bar({ dirty: true, isPending: pending, secondarySubmit: DRAFT })} />
        </form>
      );
    }

    it('absent: one submit, exactly as before', () => {
      renderWithProviders(<SaveBar {...bar({ dirty: true })} />);
      expect(screen.getAllByRole('button')).toHaveLength(2);
    });

    it('an outline submit before the primary, both naming the form, the secondary with its name', () => {
      renderWithProviders(<SaveBar {...bar({ dirty: true, secondarySubmit: DRAFT })} />);
      const draft = submit('Save draft');
      const primary = submit();
      expect(draft.type).toBe('submit');
      expect(draft.getAttribute('form')).toBe('member');
      expect(draft.name).toBe('draft');
      expect(draft.getAttribute('data-variant')).toBe('outline');
      expect(primary.getAttribute('form')).toBe('member');
      expect(
        draft.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(draft.disabled).toBe(false);
    });

    it('clean: both submits disabled', () => {
      renderWithProviders(<SaveBar {...bar({ secondarySubmit: DRAFT })} />);
      expect(submit('Save draft').disabled).toBe(true);
      expect(submit().disabled).toBe(true);
    });

    it('the secondary pressed then pending: it reads its pending label, the primary keeps its label, both disabled', async () => {
      renderWithProviders(<Pending />);
      await userEvent.click(submit('Save draft'));
      expect(submit('Saving draft…').disabled).toBe(true);
      expect(submit().disabled).toBe(true);
      expect(screen.queryByRole('button', { name: PENDING })).toBeNull();
    });

    it('the primary pressed then pending: the primary reads its pending label and the secondary is disabled', async () => {
      renderWithProviders(<Pending />);
      await userEvent.click(submit());
      expect(submit(PENDING).disabled).toBe(true);
      expect(submit('Save draft').disabled).toBe(true);
    });
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(<SaveBar {...bar({ dirty: true })} />, {
      locale: 'ar',
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
