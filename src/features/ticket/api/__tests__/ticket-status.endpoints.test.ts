import { describe, expect, it } from 'vitest';
import ar from '@/features/ticket/messages/ar.json';
import en from '@/features/ticket/messages/en.json';
import {
  BUILT_IN_CODE,
  IN_USE_CODE,
  TICKETSTATUSES_ENDPOINTS,
  TICKETSTATUSES_ERRORS,
  TICKETSTATUSES_EXPORT_COLUMNS,
  TICKETSTATUSES_EXPORT_PATH,
  TICKETSTATUSES_PATH,
  ticketStatusesHooks,
  ticketStatusesPath,
} from '../ticket-status.endpoints';

describe('Ticket Statuses API definitions', () => {
  it('declares only the routes implemented by erp-api', () => {
    expect(TICKETSTATUSES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/ticket-statuses' },
      export: { method: 'GET', path: '/api/v1/ticket-statuses/export' },
      detail: { method: 'GET', path: '/api/v1/ticket-statuses/:id' },
      create: { method: 'POST', path: '/api/v1/ticket-statuses' },
      update: { method: 'PATCH', path: '/api/v1/ticket-statuses/:id' },
      remove: { method: 'DELETE', path: '/api/v1/ticket-statuses/:id' },
    });
    expect(TICKETSTATUSES_PATH).toBe('/api/v1/ticket-statuses');
    expect(TICKETSTATUSES_EXPORT_PATH).toBe('/api/v1/ticket-statuses/export');
    expect(TICKETSTATUSES_EXPORT_COLUMNS).toEqual(['id', 'name']);
    expect(ticketStatusesPath('a/1')).toBe('/api/v1/ticket-statuses/a%2F1');
  });

  it('exposes the exact deletion-refusal codes and localized messages', () => {
    expect(TICKETSTATUSES_ERRORS).toEqual({
      namespace: 'ticket',
      codes: ['ERP-CORE-0004', IN_USE_CODE, BUILT_IN_CODE],
    });
    for (const code of [IN_USE_CODE, BUILT_IN_CODE] as const) {
      expect(en.ticket.errors[code]).toBeTruthy();
      expect(ar.ticket.errors[code]).toBeTruthy();
    }
  });

  it('provides the shared resource hooks', () => {
    expect(Object.keys(ticketStatusesHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
  });
});
