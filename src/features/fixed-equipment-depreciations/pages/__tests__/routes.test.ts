import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { FixedEquipmentDepreciationsListPage } from '../FixedEquipmentDepreciationsListPage';
import { FixedEquipmentDepreciationsPage } from '../FixedEquipmentDepreciationsPage';

/**
 * The depreciation routes under Setup: the list, a new depreciation, and one depreciation whose
 * `[id]` takes a positive integer or is `notFound()`. The list is titled with Perfex's
 * `fe_depreciations` (the tab has no menu item of its own); the form pages with
 * `fe_add_depreciations` / `fe_edit_depreciations`.
 */
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('../FixedEquipmentDepreciationsListPage', () => ({
  FixedEquipmentDepreciationsListPage: () => null,
}));
vi.mock('../FixedEquipmentDepreciationsPage', () => ({
  FixedEquipmentDepreciationsPage: () => null,
}));

describe('/setup/fixed-equipment-depreciations', () => {
  it('the list, titled fe_depreciations', async () => {
    const page =
      await import('../../../../../app/(shell)/setup/fixed-equipment-depreciations/page');
    expect(page.default().type).toBe(FixedEquipmentDepreciationsListPage);
    expect(await page.generateMetadata()).toEqual({
      title: 'fixed-equipment-depreciations.fe_depreciations',
    });
  });

  it('/new is the form with no id, titled fe_add_depreciations', async () => {
    const page =
      await import('../../../../../app/(shell)/setup/fixed-equipment-depreciations/new/page');
    const element = page.default();
    expect(element.type).toBe(FixedEquipmentDepreciationsPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({
      title: 'fixed-equipment-depreciations.fe_add_depreciations',
    });
  });

  it('[id]: awaits params (Next.js 16) and a positive integer opens that depreciation, titled fe_edit_depreciations', async () => {
    const page =
      await import('../../../../../app/(shell)/setup/fixed-equipment-depreciations/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(FixedEquipmentDepreciationsPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({
      title: 'fixed-equipment-depreciations.fe_edit_depreciations',
    });
  });

  it.each(NOT_IDS)('"%s" is not a depreciation page', async (id) => {
    const page =
      await import('../../../../../app/(shell)/setup/fixed-equipment-depreciations/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
