import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { PaymentModesListPage } from '../PaymentModesListPage';
import { PaymentModesPage } from '../PaymentModesPage';

/**
 * The payment mode routes under Setup (plan 04.2-27): the list, a new payment mode, and one payment mode whose `[id]`
 * takes a positive integer or is `notFound()` (T-4.2-60); each title is Perfex's key.
 */
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('../PaymentModesListPage', () => ({ PaymentModesListPage: () => null }));
vi.mock('../PaymentModesPage', () => ({ PaymentModesPage: () => null }));

describe('/setup/payment-modes', () => {
  it('the list, titled payment_modes', async () => {
    const page = await import('../../../../../app/(shell)/setup/payment-modes/page');
    expect(page.default().type).toBe(PaymentModesListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'payment-modes.payment_modes' });
  });

  it('/new is the form with no id, titled payment_mode_add_heading', async () => {
    const page = await import('../../../../../app/(shell)/setup/payment-modes/new/page');
    const element = page.default();
    expect(element.type).toBe(PaymentModesPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({
      title: 'payment-modes.payment_mode_add_heading',
    });
  });

  it('[id]: a positive integer opens that payment mode, titled payment_mode_edit_heading', async () => {
    const page = await import('../../../../../app/(shell)/setup/payment-modes/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(PaymentModesPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({
      title: 'payment-modes.payment_mode_edit_heading',
    });
  });

  it.each(NOT_IDS)('"%s" is not a payment mode page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/payment-modes/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
