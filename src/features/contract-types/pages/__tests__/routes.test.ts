import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { ContractTypesListPage } from '../ContractTypesListPage';
import { ContractTypesPage } from '../ContractTypesPage';

/**
 * The contract types routes under Setup: the list, a new contract type, and one contract type whose `[id]`
 * takes a positive integer or is `notFound()`; each title is Perfex's key.
 */
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('../ContractTypesListPage', () => ({ ContractTypesListPage: () => null }));
vi.mock('../ContractTypesPage', () => ({ ContractTypesPage: () => null }));

describe('/setup/contract-types', () => {
  it('the list, titled contract_types', async () => {
    const page = await import('../../../../../app/(shell)/setup/contract-types/page');
    expect(page.default().type).toBe(ContractTypesListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'contract-types.contract_types' });
  });

  it('/new is the form with no id, titled new_contract_type', async () => {
    const page = await import('../../../../../app/(shell)/setup/contract-types/new/page');
    const element = page.default();
    expect(element.type).toBe(ContractTypesPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({ title: 'contract-types.new_contract_type' });
  });

  it('[id]: a positive integer opens that contract type, titled contract_type_edit', async () => {
    const page = await import('../../../../../app/(shell)/setup/contract-types/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(ContractTypesPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({ title: 'contract-types.contract_type_edit' });
  });

  it.each(NOT_IDS)('"%s" is not a contract type page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/contract-types/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

