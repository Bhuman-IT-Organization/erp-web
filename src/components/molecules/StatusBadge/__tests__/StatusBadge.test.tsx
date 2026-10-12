// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { StatusBadge } from '../StatusBadge';

// Fixture labels: the feature passes its own translated words.
const ACTIVE = 'Active';
const INACTIVE = 'Inactive';

describe('StatusBadge', () => {
  it('active is the fixed success colour (bg-success), never the brand', () => {
    renderWithProviders(<StatusBadge status="active" label={ACTIVE} />);
    const tokens = screen.getByText(ACTIVE).className.split(' ');
    expect(tokens).toContain('bg-success');
    expect(tokens).toContain('text-success-foreground');
    // The primitive's `[a]:hover:bg-primary/80` applies to an <a> only; the fill itself is never brand.
    expect(tokens).not.toContain('bg-primary');
    expect(tokens).not.toContain('text-primary-foreground');
  });

  it('inactive uses the secondary variant', () => {
    renderWithProviders(<StatusBadge status="inactive" label={INACTIVE} />);
    expect(screen.getByText(INACTIVE).getAttribute('data-variant')).toBe('secondary');
  });

  it('alert (K10): an outline badge with the word after a 12px triangle-exclamation, never red', () => {
    renderWithProviders(<StatusBadge status="alert" label="Over budget" />);
    const badge = screen.getByText('Over budget');
    expect(badge.getAttribute('data-status')).toBe('alert');
    expect(badge.getAttribute('data-variant')).toBe('outline');
    const icon = badge.firstElementChild;
    expect(icon?.getAttribute('data-icon-name')).toBe('triangle-exclamation');
    expect(icon?.getAttribute('class')).toContain('size-3');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(badge.textContent).toBe('Over budget');
    const classes = [badge, ...badge.querySelectorAll('*')].flatMap((el) =>
      (el.getAttribute('class') ?? '').split(' '),
    );
    expect(classes.filter((token) => /^(bg|text|border)-destructive/.test(token))).toEqual([]);
  });

  it('done (M1): a secondary badge with the word after a 12px aria-hidden check (Sent, Configured)', () => {
    renderWithProviders(<StatusBadge status="done" label="Sent" />);
    const badge = screen.getByText('Sent');
    expect(badge.getAttribute('data-status')).toBe('done');
    expect(badge.getAttribute('data-variant')).toBe('secondary');
    const icon = badge.firstElementChild;
    expect(icon?.getAttribute('data-icon-name')).toBe('check');
    expect(icon?.getAttribute('class')).toContain('size-3');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(badge.textContent).toBe('Sent');
  });

  it('pending (M1): an outline badge with the word after a 12px aria-hidden clock-o (Queued, Retrying), never red', () => {
    renderWithProviders(<StatusBadge status="pending" label="Queued" />);
    const badge = screen.getByText('Queued');
    expect(badge.getAttribute('data-status')).toBe('pending');
    expect(badge.getAttribute('data-variant')).toBe('outline');
    const icon = badge.firstElementChild;
    expect(icon?.getAttribute('data-icon-name')).toBe('clock-o');
    expect(icon?.getAttribute('class')).toContain('size-3');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(badge.textContent).toBe('Queued');
    const classes = [badge, ...badge.querySelectorAll('*')].flatMap((el) =>
      (el.getAttribute('class') ?? '').split(' '),
    );
    expect(classes.filter((token) => /^(bg|text|border)-destructive/.test(token))).toEqual([]);
  });

  it('rejected (K20): an outline badge with the word after a 12px aria-hidden circle-xmark, never red', () => {
    renderWithProviders(<StatusBadge status="rejected" label="Rejected" />);
    const badge = screen.getByText('Rejected');
    expect(badge.getAttribute('data-status')).toBe('rejected');
    expect(badge.getAttribute('data-variant')).toBe('outline');
    const icon = badge.firstElementChild;
    expect(icon?.getAttribute('data-icon-name')).toBe('circle-xmark');
    expect(icon?.getAttribute('class')).toContain('size-3');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(badge.textContent).toBe('Rejected');
    const classes = [badge, ...badge.querySelectorAll('*')].flatMap((el) =>
      (el.getAttribute('class') ?? '').split(' '),
    );
    expect(classes.filter((token) => /^(bg|text|border)-destructive/.test(token))).toEqual([]);
  });

  it('returned (K20): a secondary badge with the word after a 12px aria-hidden undo', () => {
    renderWithProviders(<StatusBadge status="returned" label="Returned" />);
    const badge = screen.getByText('Returned');
    expect(badge.getAttribute('data-status')).toBe('returned');
    expect(badge.getAttribute('data-variant')).toBe('secondary');
    const icon = badge.firstElementChild;
    expect(icon?.getAttribute('data-icon-name')).toBe('undo');
    expect(icon?.getAttribute('class')).toContain('size-3');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(badge.textContent).toBe('Returned');
  });

  it('rejected and returned use no physical-direction class under ar', () => {
    const { container } = renderWithProviders(
      <>
        <StatusBadge status="rejected" label="Rejected" />
        <StatusBadge status="returned" label="Returned" />
      </>,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });

  it('active and inactive carry no icon and keep their status (M1 leaves them as they were)', () => {
    renderWithProviders(
      <>
        <StatusBadge status="active" label={ACTIVE} />
        <StatusBadge status="inactive" label={INACTIVE} />
      </>,
    );
    expect(screen.getByText(ACTIVE).getAttribute('data-status')).toBe('active');
    expect(screen.getByText(ACTIVE).firstElementChild).toBeNull();
    expect(screen.getByText(INACTIVE).getAttribute('data-status')).toBe('inactive');
    expect(screen.getByText(INACTIVE).firstElementChild).toBeNull();
  });

  it('always renders the label, so colour is never the only channel', () => {
    renderWithProviders(
      <>
        <StatusBadge status="active" label={ACTIVE} />
        <StatusBadge status="inactive" label={INACTIVE} />
      </>,
    );
    expect(screen.getByText(ACTIVE).textContent).toBe(ACTIVE);
    expect(screen.getByText(INACTIVE).textContent).toBe(INACTIVE);
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(<StatusBadge status="active" label={ACTIVE} />, {
      locale: 'ar',
    });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
