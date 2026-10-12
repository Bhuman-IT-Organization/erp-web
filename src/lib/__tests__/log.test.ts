import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '../log';

const silence = (method: 'debug' | 'info' | 'warn' | 'error') =>
  vi.spyOn(console, method).mockImplementation(() => undefined);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('log (the one console sink)', () => {
  it('debug and info are no-ops outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const debug = silence('debug');
    const info = silence('info');
    log.debug('d', 1);
    log.info('i', 2);
    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('debug and info forward in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const debug = silence('debug');
    const info = silence('info');
    log.debug('d', 1);
    log.info('i', 2);
    expect(debug).toHaveBeenCalledWith('d', 1);
    expect(info).toHaveBeenCalledWith('i', 2);
  });

  it('warn and error always forward, whatever the mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = silence('warn');
    const error = silence('error');
    const failure = new Error('boom');
    log.warn('w');
    log.error('e', failure);
    expect(warn).toHaveBeenCalledWith('w');
    expect(error).toHaveBeenCalledWith('e', failure);
  });

  it('is frozen: the sink is swapped by editing log.ts, never by patching at runtime', () => {
    expect(Object.isFrozen(log)).toBe(true);
    expect(Object.keys(log)).toEqual(['debug', 'info', 'warn', 'error']);
  });
});
