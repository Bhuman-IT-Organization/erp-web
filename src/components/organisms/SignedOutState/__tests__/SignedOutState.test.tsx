// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_NEXT } from '@/lib/auth/safe-next';
import commonEn from '@/messages/common/en.json';
import { physicalClassesIn, renderWithProviders, screen } from '@/test/render';
import { SignedOutState } from '../SignedOutState';

const COMMON = commonEn.common;

const pathname = vi.hoisted(() => ({ current: '/setup/staff/12' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

describe('SignedOutState', () => {
  it('renders common.session_ended and common.session_ended_body', () => {
    pathname.current = '/setup/staff/12';
    renderWithProviders(<SignedOutState />);
    expect(screen.getByRole('heading', { name: COMMON.session_ended })).not.toBeNull();
    expect(screen.getByText(COMMON.session_ended_body)).not.toBeNull();
    expect(screen.getByTestId('auth-refused')).not.toBeNull();
  });

  it('on /setup/staff/12 links to /login?next=%2Fsetup%2Fstaff%2F12', () => {
    pathname.current = '/setup/staff/12';
    renderWithProviders(<SignedOutState />);
    const link = screen.getByRole('link', { name: COMMON.sign_in });
    expect(link.getAttribute('href')).toBe('/login?next=%2Fsetup%2Fstaff%2F12');
  });

  it("replaces an unsafe path (//evil.com) with safeNext's fallback (T-3.2-35)", () => {
    pathname.current = '//evil.com';
    renderWithProviders(<SignedOutState />);
    const link = screen.getByRole('link', { name: COMMON.sign_in });
    expect(link.getAttribute('href')).toBe(`/login?next=${encodeURIComponent(DEFAULT_NEXT)}`);
  });

  it('uses no physical-direction class under ar', () => {
    pathname.current = '/setup/staff/12';
    const { container } = renderWithProviders(<SignedOutState />, { locale: 'ar' });
    expect(physicalClassesIn(container)).toEqual([]);
  });
});
