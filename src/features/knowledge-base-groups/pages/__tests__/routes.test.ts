import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { KnowledgeBaseGroupsListPage } from '../KnowledgeBaseGroupsListPage';
import { KnowledgeBaseGroupsPage } from '../KnowledgeBaseGroupsPage';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => Promise.resolve((key: string) => `${namespace}.${key}`),
}));
vi.mock('../KnowledgeBaseGroupsListPage', () => ({ KnowledgeBaseGroupsListPage: () => null }));
vi.mock('../KnowledgeBaseGroupsPage', () => ({ KnowledgeBaseGroupsPage: () => null }));

describe('/setup/knowledge-base-groups', () => {
  it('the list, titled groups', async () => {
    const page = await import('../../../../../app/(shell)/setup/knowledge-base-groups/page');
    expect(page.default().type).toBe(KnowledgeBaseGroupsListPage);
    expect(await page.generateMetadata()).toEqual({
      title: 'knowledge-base-groups.groups',
    });
  });

  it('/new is the form with no id, titled new_group', async () => {
    const page = await import('../../../../../app/(shell)/setup/knowledge-base-groups/new/page');
    const element = page.default();
    expect(element.type).toBe(KnowledgeBaseGroupsPage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({ title: 'knowledge-base-groups.new_group' });
  });

  it('[id]: a positive integer opens that group, titled edit_kb_group', async () => {
    const page = await import('../../../../../app/(shell)/setup/knowledge-base-groups/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(KnowledgeBaseGroupsPage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({ title: 'knowledge-base-groups.edit_kb_group' });
  });

  it.each(NOT_IDS)('"%s" is not a knowledge base group page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/knowledge-base-groups/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
