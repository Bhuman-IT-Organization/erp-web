import { describe, expect, it } from 'vitest';
import { pick } from '../pick';

const PACK = {
  common: { retry: 'Retry' },
  auth: { admin_auth_login_button: 'Login' },
  status: { title: 'Status' },
};

describe('pick', () => {
  it('keeps the named namespaces and drops the others', () => {
    expect(pick(PACK, ['common', 'auth'])).toEqual({
      common: { retry: 'Retry' },
      auth: { admin_auth_login_button: 'Login' },
    });
  });

  it('omits a namespace that is missing instead of yielding undefined', () => {
    const picked = pick(PACK, ['common', 'missing']);
    expect(Object.keys(picked)).toEqual(['common']);
    expect('missing' in picked).toBe(false);
  });

  it('returns an empty pack for no namespaces and does not mutate the source', () => {
    expect(pick(PACK, [])).toEqual({});
    expect(PACK).toEqual({
      common: { retry: 'Retry' },
      auth: { admin_auth_login_button: 'Login' },
      status: { title: 'Status' },
    });
  });
});
