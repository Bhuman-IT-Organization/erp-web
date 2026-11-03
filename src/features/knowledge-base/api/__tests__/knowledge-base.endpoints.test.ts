import { describe, expect, it } from 'vitest';
import {
  GROUP_IN_USE_CODE,
  IN_USE_CODE,
  KNOWLEDGE_BASE_ENDPOINTS,
  KNOWLEDGE_BASE_ERRORS,
  KNOWLEDGE_BASE_EXPORT_COLUMNS,
  KNOWLEDGE_BASE_EXPORT_PATH,
  KNOWLEDGE_BASE_GROUPS_EXPORT_COLUMNS,
  KNOWLEDGE_BASE_GROUPS_EXPORT_PATH,
  KNOWLEDGE_BASE_GROUPS_PATH,
  KNOWLEDGE_BASE_PATH,
  knowledgeBaseGroupHooks,
  knowledgeBaseGroupPath,
  knowledgeBaseHooks,
  knowledgeBasePath,
  NOT_FOUND_CODE,
  VALIDATION_CODE,
} from '../knowledge-base.endpoints';

describe('knowledge-base endpoints', () => {
  it('declares exactly the six calls the api module serves, method and path, the DELETE included', () => {
    expect(KNOWLEDGE_BASE_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/knowledge-base' },
      export: { method: 'GET', path: '/api/v1/knowledge-base/export' },
      detail: { method: 'GET', path: '/api/v1/knowledge-base/:id' },
      create: { method: 'POST', path: '/api/v1/knowledge-base' },
      update: { method: 'PATCH', path: '/api/v1/knowledge-base/:id' },
      remove: { method: 'DELETE', path: '/api/v1/knowledge-base/:id' },
    });
  });

  it('derives the list, the export and a record path from the table, the id encoded', () => {
    expect(KNOWLEDGE_BASE_PATH).toBe(KNOWLEDGE_BASE_ENDPOINTS.list.path);
    expect(KNOWLEDGE_BASE_EXPORT_PATH).toBe(KNOWLEDGE_BASE_ENDPOINTS.export.path);
    expect(knowledgeBasePath('7')).toBe('/api/v1/knowledge-base/7');
    expect(knowledgeBasePath('a b')).toBe('/api/v1/knowledge-base/a%20b');
    expect(knowledgeBasePath('a/1')).toBe('/api/v1/knowledge-base/a%2F1');
  });

  it('exposes knowledge-base groups endpoints and paths', () => {
    expect(KNOWLEDGE_BASE_GROUPS_PATH).toBe('/api/v1/knowledge-base/groups');
    expect(KNOWLEDGE_BASE_GROUPS_EXPORT_PATH).toBe('/api/v1/knowledge-base/groups/export');
    expect(knowledgeBaseGroupPath('5')).toBe('/api/v1/knowledge-base/groups/5');
    expect(KNOWLEDGE_BASE_GROUPS_EXPORT_COLUMNS).toEqual([
      'id',
      'name',
      'color',
      'groupOrder',
      'active',
      'totalArticles',
    ]);
    expect(Object.keys(knowledgeBaseGroupHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
  });

  it("lists Perfex's three export columns in the api order, one label each, and never the usage (D-42)", () => {
    expect(KNOWLEDGE_BASE_EXPORT_COLUMNS).toEqual(['id', 'name', 'dateCreated']);
  });

  it("names the feature's own codes: a record that is not there (D-32), and the delete refused while in use (D-07)", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(IN_USE_CODE).toBe('ERP-KNOWLEDGEBASE-0001');
    expect(GROUP_IN_USE_CODE).toBe('ERP-KNOWLEDGEBASE-0002');
    expect(KNOWLEDGE_BASE_ERRORS).toEqual({
      namespace: 'knowledge-base',
      codes: ['ERP-CORE-0004', 'ERP-KNOWLEDGEBASE-0001', 'ERP-KNOWLEDGEBASE-0002'],
    });
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(knowledgeBaseHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
