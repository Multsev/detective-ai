import { describe, expect, it } from 'vitest';
import { isAllowedBrowserOrigin, isLoopbackHostname } from '../src/server/security/localRequestGuard.js';

describe('local request guard', () => {
  it('accepts only explicit loopback hostnames', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('[::1]')).toBe(true);
    expect(isLoopbackHostname('attacker.example')).toBe(false);
    expect(isLoopbackHostname('localhost.attacker.example')).toBe(false);
  });

  it('accepts browser origins from either local development port', () => {
    expect(isAllowedBrowserOrigin(undefined)).toBe(true);
    expect(isAllowedBrowserOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedBrowserOrigin('http://127.0.0.1:8787')).toBe(true);
    expect(isAllowedBrowserOrigin('https://attacker.example')).toBe(false);
    expect(isAllowedBrowserOrigin('not a URL')).toBe(false);
  });
});
