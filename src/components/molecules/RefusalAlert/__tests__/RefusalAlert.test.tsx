// @vitest-environment happy-dom
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { physicalClassesIn, renderWithProviders, screen, userEvent, within } from '@/test/render';
import { RefusalAlert, type RefusalLine } from '../RefusalAlert';

/** K25 (04.8 UI-SPEC § Kit additions, § Refusals) over made-up lines. */
const MESSAGE = 'Some lines credit more than was invoiced.';
const HINT = 'Lower these quantities, or choose another invoice.';

function line(n: number, item: string, max: number): RefusalLine {
  return {
    id: String(n),
    content: (
      <>
        Line <bdi>{n}</bdi>, {item}: <bdi>{max}</bdi> at most.
      </>
    ),
  };
}

const LINES: readonly RefusalLine[] = [
  line(2, 'Hex bolt M8', 4),
  line(5, 'Copper pipe 15 mm', 12),
  line(7, 'Wall plug, pack of 50', 1),
];

const MANY: readonly RefusalLine[] = Array.from({ length: 40 }, (_, index) =>
  line(index + 1, 'Cable tie 200 mm', 3),
);

const ACTION = <Button variant="outline">Open credit note CN-0007</Button>;

const refusedList = () => screen.getByRole('list', { name: 'Lines refused' });

describe('RefusalAlert', () => {
  it('MessageOnly: one alert holding the message and the icon; no list, no focusable region, no action', () => {
    const view = renderWithProviders(<RefusalAlert message={MESSAGE} />);
    const alert = screen.getByRole('alert');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(alert.textContent).toBe(MESSAGE);
    expect(alert.querySelector('[data-icon-name="triangle-exclamation"]')).not.toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(view.container.querySelector('[tabindex="0"]')).toBeNull();
    expect(alert.querySelector('[data-slot="alert-action"]')).toBeNull();
  });

  it('WithLines: a list named "Lines refused", one item per line in order, tabIndex 0, the bdi kept as an element', () => {
    renderWithProviders(<RefusalAlert message={MESSAGE} lines={LINES} />);
    const list = refusedList();
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Line 2, Hex bolt M8: 4 at most.',
      'Line 5, Copper pipe 15 mm: 12 at most.',
      'Line 7, Wall plug, pack of 50: 1 at most.',
    ]);
    expect(list.tabIndex).toBe(0);
    expect(items[0]?.querySelectorAll('bdi')).toHaveLength(2);
  });

  it('an empty lines array renders no list, the same as absent', () => {
    const view = renderWithProviders(<RefusalAlert message={MESSAGE} lines={[]} />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(view.container.querySelector('[tabindex="0"]')).toBeNull();
  });

  it('a line given as a string of markup shows the characters, never an element (T-4.8-24)', () => {
    renderWithProviders(
      <RefusalAlert
        message="<i>m</i>"
        lines={[{ id: 'x', content: '<b>x</b>' }]}
        hint="<u>h</u>"
      />,
    );
    const alert = screen.getByRole('alert');
    expect(within(refusedList()).getByRole('listitem').textContent).toBe('<b>x</b>');
    expect(alert.querySelector('b, i, u')).toBeNull();
    expect(alert.textContent).toContain('<i>m</i>');
    expect(alert.textContent).toContain('<u>h</u>');
  });

  it('WithAction: the hint after the list, the action in the alert-action slot, reached by Tab after the list', async () => {
    renderWithProviders(
      <RefusalAlert message={MESSAGE} lines={LINES} hint={HINT} action={ACTION} />,
    );
    const list = refusedList();
    const hint = screen.getByText(HINT);
    expect(list.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Open credit note CN-0007' });
    expect(button.closest('[data-slot="alert-action"]')).not.toBeNull();
    await userEvent.tab();
    expect(document.activeElement).toBe(list);
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
  });

  it('the action sits on its own row in the flow, not over the message (the primitive places it absolutely)', () => {
    renderWithProviders(<RefusalAlert message={MESSAGE} action={ACTION} />);
    const alert = screen.getByRole('alert');
    const slot = alert.querySelector('[data-slot="alert-action"]');
    expect(slot?.className.split(/\s+/)).toContain('static');
    expect(slot?.className.split(/\s+/)).not.toContain('absolute');
    expect(alert.className.split(/\s+/)).not.toContain('has-data-[slot=alert-action]:pe-18');
  });

  it('the action is in the foreground colour, not the refusal red, and the message wraps pretty, not balanced (screenshot review)', () => {
    renderWithProviders(<RefusalAlert message={MESSAGE} action={ACTION} />);
    const alert = screen.getByRole('alert');
    const slot = alert.querySelector('[data-slot="alert-action"]');
    expect(slot?.className.split(/\s+/)).toContain('text-foreground');
    const description = alert.querySelector('[data-slot="alert-description"]');
    expect(description?.className.split(/\s+/)).toContain('text-pretty');
    expect(description?.className.split(/\s+/)).not.toContain('text-balance');
  });

  it('ManyLinesScroll: forty lines inside a list that scrolls at 240px at most', () => {
    renderWithProviders(
      <RefusalAlert message={MESSAGE} lines={MANY} hint={HINT} action={ACTION} />,
    );
    const list = refusedList();
    expect(within(list).getAllByRole('listitem')).toHaveLength(40);
    const classes = list.className.split(/\s+/);
    expect(classes).toContain('max-h-60');
    expect(classes).toContain('overflow-y-auto');
  });

  it('InDialog: inside the kit Dialog the alert renders above the footer; Tab goes list, then the footer in its order', async () => {
    renderWithProviders(
      <Dialog open>
        <DialogContent showCloseButton={false} aria-describedby={undefined}>
          <DialogTitle>Create refund</DialogTitle>
          <RefusalAlert message={MESSAGE} lines={LINES} hint={HINT} />
          <DialogFooter>
            <Button variant="outline">Back to credit note</Button>
            <Button>Create refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    const alert = within(dialog).getByRole('alert');
    const back = within(dialog).getByRole('button', { name: 'Back to credit note' });
    const create = within(dialog).getByRole('button', { name: 'Create refund' });
    expect(alert.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    refusedList().focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(back);
    await userEvent.tab();
    expect(document.activeElement).toBe(create);
  });

  it('Rtl: under ar the list keeps its name and the rendered tree holds no physical side class', () => {
    const view = renderWithProviders(
      <RefusalAlert message={MESSAGE} lines={LINES} hint={HINT} action={ACTION} />,
      { locale: 'ar' },
    );
    expect(refusedList()).toBeTruthy();
    expect(physicalClassesIn(view.container)).toEqual([]);
  });

  it('a ref passed in receives the alert div, focusable with tabIndex -1', () => {
    const ref = createRef<HTMLDivElement>();
    renderWithProviders(<RefusalAlert ref={ref} message={MESSAGE} />);
    expect(ref.current).toBe(screen.getByRole('alert'));
    expect(ref.current?.tabIndex).toBe(-1);
    ref.current?.focus();
    expect(document.activeElement).toBe(ref.current);
  });
});
