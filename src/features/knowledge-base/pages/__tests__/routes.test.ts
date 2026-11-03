import { describe, expect, it, vi } from 'vitest';
import { NOT_IDS, routeProps } from '@/test/route-props';
import { KnowledgeBaseListPage } from '../KnowledgeBaseListPage';
import { KnowledgeBaseGroupsPage } from '../KnowledgeBaseGroupsPage';
import { KnowledgeBasePage } from '../KnowledgeBasePage';

/**
 * The knowledge base routes under Setup (plan 04.2-27): the list, a new knowledge base, and one knowledge base whose `[id]`
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
vi.mock('../KnowledgeBaseListPage', () => ({ KnowledgeBaseListPage: () => null }));
vi.mock('../KnowledgeBaseGroupsPage', () => ({ KnowledgeBaseGroupsPage: () => null }));
vi.mock('../KnowledgeBasePage', () => ({ KnowledgeBasePage: () => null }));

describe('/setup/knowledge-base', () => {
  it('the list, titled knowledge_base', async () => {
    const page = await import('../../../../../app/(shell)/setup/knowledge-base/page');
    expect(page.default().type).toBe(KnowledgeBaseListPage);
    expect(await page.generateMetadata()).toEqual({ title: 'knowledge-base.knowledge_base' });
  });

  it('/groups is the groups list, titled groups', async () => {
    const page = await import('../../../../../app/(shell)/setup/knowledge-base/groups/page');
    expect(page.default().type).toBe(KnowledgeBaseGroupsPage);
    expect(await page.generateMetadata()).toEqual({ title: 'knowledge-base.groups' });
  });

  it('/new is the form with no id, titled add_knowledge_base', async () => {
    const page = await import('../../../../../app/(shell)/setup/knowledge-base/new/page');
    const element = page.default();
    expect(element.type).toBe(KnowledgeBasePage);
    expect(element.props).toEqual({ id: null });
    expect(await page.generateMetadata()).toEqual({ title: 'knowledge-base.add_knowledge_base' });
  });

  it('[id]: a positive integer opens that knowledge base, titled edit_knowledge_base', async () => {
    const page = await import('../../../../../app/(shell)/setup/knowledge-base/[id]/page');
    const element = await page.default(routeProps({ id: '007' }));
    expect(element.type).toBe(KnowledgeBasePage);
    expect(element.props).toEqual({ id: '7' });
    expect(await page.generateMetadata()).toEqual({ title: 'knowledge-base.edit_knowledge_base' });
  });

  it.each(NOT_IDS)('"%s" is not a knowledge base page', async (id) => {
    const page = await import('../../../../../app/(shell)/setup/knowledge-base/[id]/page');
    await expect(page.default(routeProps({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
