import { describe, expect, it } from 'vitest';

import {
  LEAD_STATUSES_ENDPOINTS,
  LEAD_STATUSES_PATH,
  LEAD_STATUSES_EXPORT_PATH,
  LEAD_STATUSES_EXPORT_COLUMNS,
  LEAD_STATUSES_ERRORS,
  leadStatusesPath,
} from '../lead-statuses.endpoints';

describe('Lead Statuses API endpoints', () => {
  it('uses the correct list endpoint', () => {
    expect(LEAD_STATUSES_ENDPOINTS.list).toEqual({
      method: 'GET',
      path: '/api/v1/lead-statuses',
    });
  });

  it('uses the correct create endpoint', () => {
    expect(LEAD_STATUSES_ENDPOINTS.create).toEqual({
      method: 'POST',
      path: '/api/v1/lead-statuses',
    });
  });

  it('uses the correct update endpoint', () => {
    expect(LEAD_STATUSES_ENDPOINTS.update).toEqual({
      method: 'PATCH',
      path: '/api/v1/lead-statuses/:id',
    });
  });

  it('uses the correct delete endpoint', () => {
    expect(LEAD_STATUSES_ENDPOINTS.remove).toEqual({
      method: 'DELETE',
      path: '/api/v1/lead-statuses/:id',
    });
  });

  it('builds detail URLs correctly', () => {
    expect(leadStatusesPath('7')).toBe('/api/v1/lead-statuses/7');
    expect(leadStatusesPath('a b')).toBe('/api/v1/lead-statuses/a%20b');
  });

  it('provides export settings', () => {
    expect(LEAD_STATUSES_PATH).toBe('/api/v1/lead-statuses');
    expect(LEAD_STATUSES_EXPORT_PATH).toBe('/api/v1/lead-statuses/export');
    expect(LEAD_STATUSES_EXPORT_COLUMNS).toContain('name');
  });

  it('defines lead status error messages', () => {
    expect(LEAD_STATUSES_ERRORS.namespace).toBe('lead-statuses');
    expect(LEAD_STATUSES_ERRORS.codes).toContain('ERP-LEADSTATUSES-0001');
    expect(LEAD_STATUSES_ERRORS.codes).toContain('ERP-LEADSTATUSES-0002');
  });
});
