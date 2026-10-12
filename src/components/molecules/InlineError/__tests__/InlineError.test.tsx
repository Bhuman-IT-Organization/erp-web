// @vitest-environment happy-dom
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen, userEvent } from '@/test/render';
import { InlineError } from '../InlineError';

const COMMON = commonEn.common;
const MESSAGE = COMMON.errors.unknown;
const BACK = { href: '/setup/staff?q=ada&cursor=abc', label: COMMON.back_to_list } as const;

// A stand-in for next/link that exposes its `scroll` prop, so a test can see how it navigates.
vi.mock('next/link', () => ({
  default: function NextLink({
    href,
    scroll,
    ...rest
  }: ComponentProps<'a'> & { href: string; scroll?: boolean }) {
    return <a href={href} data-scroll={String(scroll)} {...rest} />;
  },
}));

describe('InlineError', () => {
  it('is an alert with the circle-exclamation icon and the message', () => {
    renderWithProviders(<InlineError message={MESSAGE} />);
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('data-testid')).toBe('inline-error');
    expect(alert.querySelector('[data-icon-name="circle-exclamation"]')).not.toBeNull();
    expect(alert.textContent).toContain(MESSAGE);
  });

  it('has no Retry when onRetry is not given (a 4xx)', () => {
    renderWithProviders(<InlineError message={MESSAGE} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows Retry (common.retry) when onRetry is given, and clicking it calls onRetry', async () => {
    const onRetry = vi.fn();
    renderWithProviders(<InlineError message={MESSAGE} onRetry={onRetry} testId="list-error" />);
    await userEvent.click(screen.getByRole('button', { name: COMMON.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('list-error')).not.toBeNull();
  });

  it('keeps Retry neutral: the alert is red, the outline button is not (a retry is not destructive)', () => {
    renderWithProviders(<InlineError message={MESSAGE} onRetry={vi.fn()} />);
    const tokens = screen.getByRole('button', { name: COMMON.retry }).className.split(' ');
    expect(tokens).toContain('text-foreground');
  });

  it('busy: Retry reads common.retrying, is disabled and aria-busy, so a click is never silent', () => {
    renderWithProviders(<InlineError message={MESSAGE} onRetry={vi.fn()} busy />);
    const button = screen.getByRole('button', { name: COMMON.retrying });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('button', { name: COMMON.retry })).toBeNull();
  });

  it('back: a link named by its label, to its href — with no Retry for a 4xx', () => {
    renderWithProviders(<InlineError message={MESSAGE} back={BACK} />);
    const link = screen.getByRole('link', { name: COMMON.back_to_list });
    expect(link.getAttribute('href')).toBe(BACK.href);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('back beside Retry: Retry first, then the link; the link stays usable while a retry is in flight', () => {
    renderWithProviders(<InlineError message={MESSAGE} onRetry={vi.fn()} busy back={BACK} />);
    const retry = screen.getByRole('button', { name: COMMON.retrying });
    const link = screen.getByRole('link', { name: COMMON.back_to_list });
    expect(retry.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(link.hasAttribute('aria-disabled')).toBe(false);
    expect(link.hasAttribute('disabled')).toBe(false);
  });

  it('back navigates with scroll={false}, so the list restores its own position (D-28)', () => {
    renderWithProviders(<InlineError message={MESSAGE} back={BACK} />);
    const link = screen.getByRole('link', { name: COMMON.back_to_list });
    expect(link.getAttribute('data-scroll')).toBe('false');
  });

  it('back is a 32 px outline button-styled link, neutral like Retry, not underlined', () => {
    renderWithProviders(<InlineError message={MESSAGE} back={BACK} />);
    const link = screen.getByRole('link', { name: COMMON.back_to_list });
    expect(link.getAttribute('data-slot')).toBe('button');
    expect(link.getAttribute('data-variant')).toBe('outline');
    expect(link.getAttribute('data-size')).toBe('default');
    expect(link.className.split(' ')).toContain('text-foreground');
    const description = screen.getByRole('alert').querySelector('[data-slot="alert-description"]');
    const tokens = description?.className.split(' ') ?? [];
    expect(tokens).toContain('[&_a]:no-underline');
    expect(tokens).not.toContain('[&_a]:underline');
  });

  it('Retry is a 32 px button (size default, UI-SPEC: never size sm)', () => {
    renderWithProviders(<InlineError message={MESSAGE} onRetry={vi.fn()} />);
    const retry = screen.getByRole('button', { name: COMMON.retry });
    expect(retry.getAttribute('data-size')).toBe('default');
  });

  it('uses no physical-direction class under ar', () => {
    const { container } = renderWithProviders(
      <InlineError message={MESSAGE} onRetry={vi.fn()} back={BACK} />,
      { locale: 'ar' },
    );
    expect(physicalClassesIn(container)).toEqual([]);
  });

  it('the icon sits in the message row, before the message, so it centres with the message and the 32 px buttons (UAT 6)', () => {
    renderWithProviders(<InlineError message={MESSAGE} onRetry={vi.fn()} back={BACK} />);
    const alert = screen.getByRole('alert');
    expect(alert.querySelector(':scope > [data-icon-name]')).toBeNull();
    const description = alert.querySelector('[data-slot="alert-description"]');
    const icon = description?.querySelector('[data-icon-name="circle-exclamation"]') ?? null;
    expect(icon).not.toBeNull();
    const row = icon?.parentElement ?? null;
    expect(row?.getAttribute('class')?.split(' ')).toEqual(
      expect.arrayContaining(['flex', 'items-center']),
    );
    expect(row?.textContent).toBe(MESSAGE);
    const message = [...(row?.children ?? [])].find((el) => el.textContent === MESSAGE);
    expect(message).toBeDefined();
    expect(
      (icon?.compareDocumentPosition(message as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(description?.className.split(' ')).toContain('items-center');
  });
});
