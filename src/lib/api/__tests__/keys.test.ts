import { describe, expect, it } from 'vitest';
import { apiKey, keyPrefix, matchesPrefix } from '../keys';

describe('apiKey (FE-03 string keys)', () => {
  it('is the bare path without params or with an empty object', () => {
    expect(apiKey('/api/v1/x')).toBe('/api/v1/x');
    expect(apiKey('/api/v1/x', {})).toBe('/api/v1/x');
  });

  it('sorts the query keys so argument order never splits the cache', () => {
    expect(apiKey('/api/v1/x', { q: 'a b', limit: 50 })).toBe('/api/v1/x?limit=50&q=a%20b');
    expect(apiKey('/api/v1/x', { limit: 50, q: 'a b' })).toBe(
      apiKey('/api/v1/x', { q: 'a b', limit: 50 }),
    );
  });

  it('omits undefined but keeps false and 0', () => {
    expect(apiKey('/api/v1/x', { a: undefined, b: false, c: 0 })).toBe('/api/v1/x?b=false&c=0');
    expect(apiKey('/api/v1/x', { a: undefined })).toBe('/api/v1/x');
  });

  it('URL-encodes names and values', () => {
    expect(apiKey('/api/v1/x', { 'a&b': 'c=d/é' })).toBe('/api/v1/x?a%26b=c%3Dd%2F%C3%A9');
  });
});

describe('keyPrefix / matchesPrefix', () => {
  it('keyPrefix is the path itself', () => {
    expect(keyPrefix('/api/v1/item')).toBe('/api/v1/item');
  });

  it('matches the exact path and its ? and / continuations', () => {
    const match = matchesPrefix('/api/v1/item');
    expect(match('/api/v1/item')).toBe(true);
    expect(match('/api/v1/item?limit=1')).toBe(true);
    expect(match('/api/v1/item/42')).toBe(true);
    expect(match('/api/v1/item/42?expand=x')).toBe(true);
  });

  it('rejects a sibling sharing the spelling, another resource and non-string keys', () => {
    const match = matchesPrefix('/api/v1/item');
    expect(match('/api/v1/item-x')).toBe(false);
    expect(match('/api/v1/items')).toBe(false);
    expect(match('/api/v1/other')).toBe(false);
    expect(match(['/api/v1/item'])).toBe(false);
    expect(match(null)).toBe(false);
    expect(match(undefined)).toBe(false);
  });
});
