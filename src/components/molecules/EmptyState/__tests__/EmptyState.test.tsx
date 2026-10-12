// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { EmptyState } from '../EmptyState';

// Fixture copy: the kit receives already-translated strings; the feature owns the words.
const HEADING = 'No things yet';
const BODY = 'Add the first thing.';
const ACTION = commonEn.common.clear_search;

describe('EmptyState', () => {
  it('renders the heading, the body and the action', () => {
    renderWithProviders(
      <EmptyState heading={HEADING} body={BODY} action={<Button type="button">{ACTION}</Button>} />,
    );
    expect(screen.getByRole('heading', { name: HEADING })).not.toBeNull();
    expect(screen.getByText(BODY)).not.toBeNull();
    expect(screen.getByRole('button', { name: ACTION })).not.toBeNull();
    expect(screen.getByTestId('list-empty')).not.toBeNull();
  });

  it('renders no button when no action is given', () => {
    renderWithProviders(<EmptyState heading={HEADING} body={BODY} testId="roles-empty" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('roles-empty')).not.toBeNull();
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(
      <EmptyState heading={HEADING} body={BODY} action={<Button type="button">{ACTION}</Button>} />,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
