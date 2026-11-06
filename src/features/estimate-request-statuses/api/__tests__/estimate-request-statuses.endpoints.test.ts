import { describe, expect, it } from 'vitest';
import {
  ESTIMATE_REQUEST_STATUSES_ENDPOINTS,
  ESTIMATE_REQUEST_STATUSES_ERRORS,
  ESTIMATE_REQUEST_STATUSES_EXPORT_COLUMNS,
  ESTIMATE_REQUEST_STATUSES_EXPORT_PATH,
  ESTIMATE_REQUEST_STATUSES_PATH,
  estimateRequestStatusesHooks,
  estimateRequestStatusesPath,
} from '../estimate-request-statuses.endpoints';

describe('Estimate Request Statuses API definitions', () => {
  it('declares the resource endpoints and export columns', () => {
    expect(ESTIMATE_REQUEST_STATUSES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/estimate-request-statuses' },
      export: { method: 'GET', path: '/api/v1/estimate-request-statuses/export' },
      detail: { method: 'GET', path: '/api/v1/estimate-request-statuses/:id' },
      create: { method: 'POST', path: '/api/v1/estimate-request-statuses' },
      update: { method: 'PATCH', path: '/api/v1/estimate-request-statuses/:id' },
      remove: { method: 'DELETE', path: '/api/v1/estimate-request-statuses/:id' },
    });
    expect(ESTIMATE_REQUEST_STATUSES_PATH).toBe('/api/v1/estimate-request-statuses');
    expect(ESTIMATE_REQUEST_STATUSES_EXPORT_PATH).toBe('/api/v1/estimate-request-statuses/export');
    expect(ESTIMATE_REQUEST_STATUSES_EXPORT_COLUMNS).toEqual(['id', 'name', 'total_request']);
    expect(estimateRequestStatusesPath('5/6')).toBe('/api/v1/estimate-request-statuses/5%2F6');
    expect(Object.keys(estimateRequestStatusesHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
  });

  it('exposes the backend delete-refusal codes', () => {
    expect(ESTIMATE_REQUEST_STATUSES_ERRORS).toEqual({
      namespace: 'estimate-request-statuses',
      codes: [
        'ERP-CORE-0004',
        'ERP-ESTIMATEREQUESTSTATUSES-0001',
        'ERP-ESTIMATEREQUESTSTATUSES-0002',
      ],
    });
  });
});
