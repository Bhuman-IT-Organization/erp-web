import { describe, expect, it } from 'vitest';
import {
  estimateRequestStatusSchema,
  estimateRequestStatusFormSchema,
  toEstimateRequestStatusWriteValues,
} from '../estimate-request-statuses.schema';

describe('Estimate Request Status schema', () => {
  it('normalizes nullable colors for the form and keeps request totals nonnegative', () => {
    expect(
      estimateRequestStatusSchema.parse({
        id: '3',
        name: 'Processing',
        color: null,
        statusorder: 2,
        flag: 'processing',
        total_request: 4,
      }),
    ).toEqual({
      id: '3',
      name: 'Processing',
      color: '',
      statusorder: 2,
      flag: 'processing',
      total_request: 4,
    });
    expect(() =>
      estimateRequestStatusSchema.parse({
        id: '3',
        name: 'Processing',
        color: null,
        statusorder: 2,
        flag: null,
        total_request: -1,
      }),
    ).toThrow();
  });

  it('trims names and converts a blank order to null for the API', () => {
    const values = estimateRequestStatusFormSchema.parse({
      name: '  Ready  ',
      color: '#757575',
      statusorder: '',
    });
    expect(values.name).toBe('Ready');
    expect(toEstimateRequestStatusWriteValues(values)).toEqual({
      name: 'Ready',
      color: '#757575',
      statusorder: null,
    });
  });

  it('normalizes numeric order strings before building the save summary', () => {
    const values = estimateRequestStatusFormSchema.parse({
      name: 'Ready',
      color: '#757575',
      statusorder: '007',
    });
    expect(values.statusorder).toBe('7');
    expect(toEstimateRequestStatusWriteValues(values).statusorder).toBe(7);
  });

  it('rejects a name longer than 50 characters', () => {
    expect(() =>
      estimateRequestStatusFormSchema.parse({
        name: 'A'.repeat(51),
        color: '#757575',
        statusorder: 1,
      }),
    ).toThrow();
  });

  it('rejects a color longer than 10 characters', () => {
    expect(() =>
      estimateRequestStatusFormSchema.parse({
        name: 'Ready',
        color: '#1234567890',
        statusorder: 1,
      }),
    ).toThrow();
  });

  it('rejects a non-numeric order', () => {
    expect(() =>
      estimateRequestStatusFormSchema.parse({
        name: 'Ready',
        color: '#757575',
        statusorder: 'first',
      }),
    ).toThrow();
  });

  it('rejects an order outside the signed 32-bit integer range', () => {
    for (const statusorder of [-2_147_483_649, 2_147_483_648, '3000000000']) {
      expect(() =>
        estimateRequestStatusFormSchema.parse({
          name: 'Ready',
          color: '#757575',
          statusorder,
        }),
      ).toThrow(/order_out_of_range/);
    }
  });
});
