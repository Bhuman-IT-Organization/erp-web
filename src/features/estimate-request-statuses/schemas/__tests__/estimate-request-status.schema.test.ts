import { describe, expect, it } from 'vitest';
import {
  estimateRequestStatusSchema,
  estimateRequestStatusWriteSchema,
} from '../estimate-request-status.schema';

const STATUS = {
  id: '7',
  name: 'Approved',
  color: '#008000',
  statusorder: 2,
  flag: null,
  total_request: 3,
};

describe('estimateRequestStatusSchema', () => {
  it('parses the API record without changing its values', () => {
    expect(estimateRequestStatusSchema.parse(STATUS)).toEqual(STATUS);
  });

  it('rejects invalid counts and undeclared response fields', () => {
    expect(() => estimateRequestStatusSchema.parse({ ...STATUS, total_request: -1 })).toThrow();
    expect(() => estimateRequestStatusSchema.parse({ ...STATUS, extra: true })).toThrow();
  });
});

describe('estimateRequestStatusWriteSchema', () => {
  it('accepts the create and update body fields', () => {
    expect(
      estimateRequestStatusWriteSchema.parse({
        name: ' Approved ',
        color: '#008000',
        statusorder: 2,
      }),
    ).toEqual({ name: 'Approved', color: '#008000', statusorder: 2 });
  });

  it('rejects unsupported fields and invalid names', () => {
    expect(() => estimateRequestStatusWriteSchema.parse({ name: ' ', extra: true })).toThrow();
    expect(() => estimateRequestStatusWriteSchema.parse({ name: 'x'.repeat(51) })).toThrow();
  });
});
