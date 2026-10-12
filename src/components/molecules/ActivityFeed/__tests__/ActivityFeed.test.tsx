// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { ActivityFeed, type ActivityEntry, type ActivityNote } from '../ActivityFeed';

/** K19 (04.6 UI-SPEC § Detail tab, Activity log) over made-up entries. */
const COMMON = commonEn.common;

const entries = (count: number): ActivityEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    actor: `Staff ${String(i + 1)}`,
    message: `Note ${String(i + 1)}`,
    at: `2026-10-${String(5 - (i % 5)).padStart(2, '0')}T09:30:00Z`,
  }));

describe('ActivityFeed', () => {
  it('Loaded: newest first as given; the actor, the message and the time of each entry', () => {
    const { container } = renderWithProviders(<ActivityFeed entries={entries(3)} />);
    const items = [...container.querySelectorAll('li')];
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain('Staff 1');
    expect(items[0]?.textContent).toContain('Note 1');
    expect(screen.getByText('Staff 1').className).toContain('font-semibold');
    const time = items[0]?.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe('2026-10-05T09:30:00Z');
    expect(time?.className).toContain('text-xs');
  });

  it('ShowMore: 12 entries show 10 and "Show 2 more"; pressing it shows all 12', async () => {
    const { container } = renderWithProviders(<ActivityFeed entries={entries(12)} />);
    expect(container.querySelectorAll('li')).toHaveLength(10);
    await userEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(container.querySelectorAll('li')).toHaveLength(12);
    expect(screen.queryByRole('button', { name: /Show \d+ more/ })).toBeNull();
  });

  it('pageSize sets the first page', () => {
    const { container } = renderWithProviders(<ActivityFeed entries={entries(5)} pageSize={2} />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Show 3 more' })).toBeTruthy();
  });

  it('Loading: undefined shows 3 skeleton entries and no empty text (D-39)', () => {
    renderWithProviders(<ActivityFeed entries={undefined} />);
    expect(screen.getAllByTestId('activity-loading')).toHaveLength(3);
    expect(screen.queryByText(COMMON.activity_empty)).toBeNull();
  });

  it('Empty: [] shows "No activity yet" in muted text', () => {
    renderWithProviders(<ActivityFeed entries={[]} />);
    expect(screen.getByText('No activity yet').className).toContain('text-muted-foreground');
  });

  it('emptyText (opt-in, plan 04.7-23): [] shows the feature words instead, with the composer under them', () => {
    const note: ActivityNote = { label: 'Add to the log', onAdd: vi.fn(), errorOf: () => 'failed' };
    renderWithProviders(<ActivityFeed entries={[]} emptyText="Nothing logged yet" note={note} />);
    expect(screen.getByText('Nothing logged yet')).toBeTruthy();
    expect(screen.queryByText(COMMON.activity_empty)).toBeNull();
    expect(screen.getByLabelText('Add to the log')).toBeTruthy();
  });

  it('a message with markup renders as text, line breaks kept (T-4.6-28)', () => {
    const { container } = renderWithProviders(
      <ActivityFeed
        entries={[{ id: '1', actor: 'Staff', message: '<b>bold</b>\nnext', at: '2026-10-05' }]}
      />,
    );
    expect(container.querySelector('li b')).toBeNull();
    const message = screen.getByText(/<b>bold<\/b>/);
    expect(message.textContent).toBe('<b>bold</b>\nnext');
    expect(message.className).toContain('whitespace-pre-line');
  });

  it('Rtl: no physical-direction class under ar, loaded and loading', () => {
    const loaded = renderWithProviders(<ActivityFeed entries={entries(12)} />, { locale: 'ar' });
    expect(physicalClassesIn(loaded.container)).toEqual([]);
    loaded.unmount();
    const { container } = renderWithProviders(<ActivityFeed entries={undefined} />, {
      locale: 'ar',
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});

/** K23 (04.7 UI-SPEC § Kit additions, § Shipping Log): the four opt-ins over made-up entries. */
const note = (overrides: Partial<ActivityNote> = {}): ActivityNote => ({
  label: 'Add to the shipping log',
  submitLabel: 'Add note',
  pendingLabel: 'Adding note…',
  onAdd: vi.fn(() => Promise.resolve()),
  errorOf: () => 'We could not add the note.',
  ...overrides,
});

describe('ActivityFeed K23 opt-ins', () => {
  it('an entry without a date (at is empty) renders its message and no time, never a crash (plan 04.7-11)', () => {
    const { container } = renderWithProviders(
      <ActivityFeed entries={[{ id: '1', actor: 'Staff One', message: 'Undated line', at: '' }]} />,
    );
    const item = container.querySelector('li');
    expect(item?.textContent).toContain('Undated line');
    expect(item?.querySelector('time')).toBeNull();
  });

  it('ActorlessEntries: an entry without actor renders no name element, only the message and the time', () => {
    const { container } = renderWithProviders(
      <ActivityFeed
        entries={[
          {
            id: '1',
            message: 'Customer confirmed the payment',
            at: '2026-10-05T09:30:00Z',
          },
        ]}
      />,
    );
    const item = container.querySelector('li');
    expect(item?.children).toHaveLength(2);
    expect(item?.querySelector('.font-semibold')).toBeNull();
    expect(item?.firstElementChild?.textContent).toBe('Customer confirmed the payment');
    expect(item?.querySelector('time')).not.toBeNull();
  });

  it('Removable: a removable entry has a 32px ghost destructive button named by its time; clicking calls onRemoveEntry(id) once', async () => {
    const onRemoveEntry = vi.fn();
    const { container } = renderWithProviders(
      <ActivityFeed
        entries={[
          {
            id: 'a',
            actor: 'Staff 1',
            message: 'Packed',
            at: '2026-10-05T09:30:00Z',
            removable: true,
          },
          { id: 'b', actor: 'Staff 2', message: 'Picked', at: '2026-10-04T09:30:00Z' },
        ]}
        onRemoveEntry={onRemoveEntry}
      />,
    );
    const items = [...container.querySelectorAll('li')];
    const time = items[0]?.querySelector('time bdi')?.textContent ?? '';
    const button = screen.getByRole('button', { name: `Remove entry from ${time}` });
    expect(items[0]?.contains(button)).toBe(true);
    expect(button.getAttribute('data-variant')).toBe('ghost');
    expect(button.className).toContain('size-8');
    expect(button.className).toContain('text-destructive');
    expect(button.querySelector('[data-icon-name="xmark"]')?.getAttribute('class')).toContain(
      'size-4',
    );
    expect(items[1]?.querySelector('button')).toBeNull();
    await userEvent.click(button);
    expect(onRemoveEntry).toHaveBeenCalledTimes(1);
    expect(onRemoveEntry).toHaveBeenCalledWith('a');
  });

  it('without removable no remove button renders, even with onRemoveEntry', () => {
    renderWithProviders(<ActivityFeed entries={entries(3)} onRemoveEntry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Remove entry from/ })).toBeNull();
  });

  it('without onRemoveEntry no remove button renders, even on a removable entry', () => {
    renderWithProviders(
      <ActivityFeed
        entries={[
          { id: 'a', actor: 'Staff', message: 'Packed', at: '2026-10-05', removable: true },
        ]}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('WithNote: the textarea is labelled; a resolving onAdd receives the trimmed text and the textarea clears', async () => {
    const onAdd = vi.fn(() => Promise.resolve());
    renderWithProviders(<ActivityFeed entries={entries(1)} note={note({ onAdd })} />);
    const box = screen.getByRole('textbox', { name: 'Add to the shipping log' });
    await userEvent.type(box, '  Left the gate  ');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('Left the gate');
    expect((box as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Add note' }).getAttribute('data-variant')).toBe(
      'outline',
    );
  });

  it('an empty or spaces-only submit shows "Enter a note." and sends nothing', async () => {
    const onAdd = vi.fn(() => Promise.resolve());
    renderWithProviders(<ActivityFeed entries={[]} note={note({ onAdd })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByText('Enter a note.').className).toContain('text-destructive');
    await userEvent.type(screen.getByRole('textbox', { name: 'Add to the shipping log' }), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('NotePending: while onAdd is pending the button shows the pending label and is disabled', async () => {
    let finish: () => void = () => undefined;
    const onAdd = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderWithProviders(<ActivityFeed entries={entries(1)} note={note({ onAdd })} />);
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Add to the shipping log' }),
      'Loaded',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    const pending = screen.getByRole('button', { name: 'Adding note…' });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    finish();
    expect(await screen.findByRole('button', { name: 'Add note' })).toBeTruthy();
  });

  it('NoteError: a rejecting onAdd shows errorOf(error) under the textarea and keeps the text', async () => {
    const failure = new Error('made-up failure');
    const errorOf = vi.fn(() => 'We could not add the note.');
    renderWithProviders(
      <ActivityFeed
        entries={entries(1)}
        note={note({ onAdd: () => Promise.reject(failure), errorOf })}
      />,
    );
    const box = screen.getByRole('textbox', { name: 'Add to the shipping log' });
    await userEvent.type(box, 'Driver called');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('We could not add the note.')).toBeTruthy();
    expect(errorOf).toHaveBeenCalledWith(failure);
    expect((box as HTMLTextAreaElement).value).toBe('Driver called');
    expect(box.getAttribute('aria-invalid')).toBe('true');
  });

  it('without submitLabel and pendingLabel the composer reads common "Add note" and "Adding note…"', async () => {
    const onAdd = vi.fn(() => new Promise<void>(() => undefined));
    renderWithProviders(
      <ActivityFeed
        entries={entries(1)}
        note={{ label: 'Note', onAdd, errorOf: () => 'Failed' }}
      />,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), 'Loaded');
    await userEvent.click(screen.getByRole('button', { name: COMMON.add_note }));
    expect(screen.getByRole('button', { name: COMMON.adding_note })).toBeTruthy();
    expect([COMMON.add_note, COMMON.adding_note]).toEqual(['Add note', 'Adding note…']);
  });

  it('Enter in the textarea inserts a line break and submits nothing', async () => {
    const onAdd = vi.fn(() => Promise.resolve());
    renderWithProviders(<ActivityFeed entries={entries(1)} note={note({ onAdd })} />);
    const box = screen.getByRole('textbox', { name: 'Add to the shipping log' });
    await userEvent.type(box, 'one{Enter}two');
    expect((box as HTMLTextAreaElement).value).toBe('one\ntwo');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('HighlightNewest: the first entry message is font-semibold and no other', () => {
    renderWithProviders(<ActivityFeed entries={entries(3)} highlightNewest />);
    expect(screen.getByText('Note 1').className).toContain('font-semibold');
    expect(screen.getByText('Note 2').className).not.toContain('font-semibold');
    expect(screen.getByText('Note 3').className).not.toContain('font-semibold');
  });

  it('without highlightNewest no message is font-semibold', () => {
    renderWithProviders(<ActivityFeed entries={entries(2)} />);
    expect(screen.getByText('Note 1').className).not.toContain('font-semibold');
  });

  it('D-39: entries undefined renders the skeleton, no empty text and no composer', () => {
    renderWithProviders(<ActivityFeed entries={undefined} note={note()} />);
    expect(screen.getAllByTestId('activity-loading')).toHaveLength(3);
    expect(screen.queryByText(COMMON.activity_empty)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a markup message on an actorless highlighted entry renders as characters (T-4.7-07)', () => {
    const { container } = renderWithProviders(
      <ActivityFeed
        entries={[{ id: '1', message: '<b>x</b>', at: '2026-10-05' }]}
        highlightNewest
      />,
    );
    expect(container.querySelector('li b')).toBeNull();
    expect(screen.getByText('<b>x</b>').textContent).toBe('<b>x</b>');
  });

  it('Rtl: the opt-ins use no physical-direction class under ar', () => {
    const { container } = renderWithProviders(
      <ActivityFeed
        entries={[
          { id: 'a', message: 'Customer line', at: '2026-10-05T09:30:00Z', removable: true },
          { id: 'b', actor: 'سارة المنصوري', message: 'Packed', at: '2026-10-04T09:30:00Z' },
        ]}
        onRemoveEntry={vi.fn()}
        note={note()}
        highlightNewest
      />,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
