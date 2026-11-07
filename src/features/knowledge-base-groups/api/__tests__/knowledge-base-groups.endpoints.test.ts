import { describe, expect, it } from 'vitest';
import ar from '@/features/knowledge-base-groups/messages/ar.json';
import en from '@/features/knowledge-base-groups/messages/en.json';
import {
  GROUP_IN_USE_CODE,
  KNOWLEDGE_BASE_GROUPS_ENDPOINTS,
  KNOWLEDGE_BASE_GROUPS_ERRORS,
  KNOWLEDGE_BASE_GROUPS_EXPORT_COLUMNS,
  KNOWLEDGE_BASE_GROUPS_EXPORT_PATH,
  KNOWLEDGE_BASE_GROUPS_PATH,
  knowledgeBaseGroupHooks,
  knowledgeBaseGroupPath,
  NOT_FOUND_CODE,
  VALIDATION_CODE,
} from '../knowledge-base-groups.endpoints';

describe('knowledge-base-groups endpoints', () => {
  it('declares the endpoints for knowledge-base-groups', () => {
    expect(KNOWLEDGE_BASE_GROUPS_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/knowledge-base-groups' },
      export: { method: 'GET', path: '/api/v1/knowledge-base-groups/export' },
      detail: { method: 'GET', path: '/api/v1/knowledge-base-groups/:id' },
      create: { method: 'POST', path: '/api/v1/knowledge-base-groups' },
      update: { method: 'PATCH', path: '/api/v1/knowledge-base-groups/:id' },
      remove: { method: 'DELETE', path: '/api/v1/knowledge-base-groups/:id' },
    });
  });

  it('exposes knowledge-base groups endpoints and paths', () => {
    expect(KNOWLEDGE_BASE_GROUPS_PATH).toBe('/api/v1/knowledge-base-groups');
    expect(KNOWLEDGE_BASE_GROUPS_EXPORT_PATH).toBe('/api/v1/knowledge-base-groups/export');
    expect(knowledgeBaseGroupPath('5')).toBe('/api/v1/knowledge-base-groups/5');
    expect(knowledgeBaseGroupPath('a/b')).toBe('/api/v1/knowledge-base-groups/a%2Fb');
    expect(KNOWLEDGE_BASE_GROUPS_EXPORT_COLUMNS).toEqual([
      'id',
      'name',
      'color',
      'groupOrder',
      'active',
      'totalArticles',
    ]);
  });

  it('declares errors namespace and codes', () => {
    expect(KNOWLEDGE_BASE_GROUPS_ERRORS).toEqual({
      namespace: 'knowledge-base-groups',
      codes: [NOT_FOUND_CODE, GROUP_IN_USE_CODE],
    });
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(GROUP_IN_USE_CODE).toBe('ERP-KNOWLEDGEBASEGROUPS-0001');
    expect(en['knowledge-base-groups'].errors[GROUP_IN_USE_CODE]).toBe(
      en['knowledge-base-groups'].is_referenced,
    );
    expect(ar['knowledge-base-groups'].errors[GROUP_IN_USE_CODE]).toBe(
      ar['knowledge-base-groups'].is_referenced,
    );
  });

  it('provides the shared resource hooks', () => {
    expect(Object.keys(knowledgeBaseGroupHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
  });
});
