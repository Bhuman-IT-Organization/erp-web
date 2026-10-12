import { describe, expect, it } from 'vitest';
import authEn from '../../messages/en.json';
import { LOGIN_MESSAGE_KEYS, loginSchema } from '../login.schema';

describe('loginSchema', () => {
  it('parses a valid input', () => {
    const parsed = loginSchema.safeParse({ email: 'staff@example.com', password: 'secret' });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty password with the message KEY on password', () => {
    const parsed = loginSchema.safeParse({ email: 'staff@example.com', password: '' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path.join('.'))).toEqual(['password']);
    expect(parsed.error?.issues[0]?.message).toBe(LOGIN_MESSAGE_KEYS.password);
  });

  it('rejects a malformed email with the message KEY on email', () => {
    const parsed = loginSchema.safeParse({ email: 'not-an-email', password: 'x' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path.join('.'))).toEqual(['email']);
    expect(parsed.error?.issues[0]?.message).toBe(LOGIN_MESSAGE_KEYS.email);
  });

  it('both keys exist in the auth message file (the form renders t(key))', () => {
    const auth = authEn.auth as Record<string, unknown>;
    expect(auth[LOGIN_MESSAGE_KEYS.email]).toBe('Enter a valid email address');
    expect(auth[LOGIN_MESSAGE_KEYS.password]).toBe('Enter your password');
  });
});
