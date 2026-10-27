import { describe, expect, it } from 'vitest';
import ar from '@/features/ticket-statuses/messages/ar.json';
import en from '@/features/ticket-statuses/messages/en.json';
import {
  BUILT_IN_CODE,
  IN_USE_CODE,
  TICKET_STATUSES_ENDPOINTS,
  TICKET_STATUSES_ERRORS,
  TICKET_STATUSES_EXPORT_COLUMNS,
  TICKET_STATUSES_EXPORT_PATH,
  TICKET_STATUSES_PATH,
  ticketStatusesHooks,
  ticketStatusesPath,
} from '../ticket-statuses.endpoints';

describe('Ticket Statuses API definitions', () => {
  it('declares only the routes implemented by erp-api', () => {
    expect(TICKET_STATUSES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/ticket-statuses' },
      export: { method: 'GET', path: '/api/v1/ticket-statuses/export' },
      detail: { method: 'GET', path: '/api/v1/ticket-statuses/:id' },
      create: { method: 'POST', path: '/api/v1/ticket-statuses' },
      update: { method: 'PATCH', path: '/api/v1/ticket-statuses/:id' },
      remove: { method: 'DELETE', path: '/api/v1/ticket-statuses/:id' },
    });
    expect(TICKET_STATUSES_PATH).toBe('/api/v1/ticket-statuses');
    expect(TICKET_STATUSES_EXPORT_PATH).toBe('/api/v1/ticket-statuses/export');
    expect(TICKET_STATUSES_EXPORT_COLUMNS).toEqual(['id', 'name']);
    expect(ticketStatusesPath('a/1')).toBe('/api/v1/ticket-statuses/a%2F1');
  });

  it('exposes the exact deletion-refusal codes and localized messages', () => {
    expect(TICKET_STATUSES_ERRORS).toEqual({
      namespace: 'ticket-statuses',
      codes: ['ERP-CORE-0004', IN_USE_CODE, BUILT_IN_CODE],
    });

    for (const code of [IN_USE_CODE, BUILT_IN_CODE] as const) {
      expect(en['ticket-statuses'].errors[code]).toBeTruthy();
      expect(ar['ticket-statuses'].errors[code]).toBeTruthy();
    }
    expect(en['ticket-statuses'].errors[IN_USE_CODE]).toBe(en['ticket-statuses'].is_referenced);
    expect(en['ticket-statuses'].errors[BUILT_IN_CODE]).toBe(
      en['ticket-statuses'].cant_delete_default,
    );
    expect(ar['ticket-statuses'].errors[IN_USE_CODE]).toBe(ar['ticket-statuses'].is_referenced);
    expect(ar['ticket-statuses'].errors[BUILT_IN_CODE]).toBe(
      ar['ticket-statuses'].cant_delete_default,
    );
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
