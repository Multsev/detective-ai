import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GoogleContactsService, normalizeGoogleContact } from '../src/server/google/googleContactsService.js';
import { GoogleTokenStore } from '../src/server/google/googleTokenStore.js';

describe('Google Contacts service', () => {
  it('completes OAuth, stores tokens and normalizes People API contacts', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'google-contacts-'));
    const store = new GoogleTokenStore(directory);
    const requests: string[] = [];
    const fakeFetch = async (input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      if (url.includes('/token')) return new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, token_type: 'Bearer' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ connections: [{ resourceName: 'people/42', names: [{ displayName: 'Анна Волкова', givenName: 'Анна', familyName: 'Волкова', metadata: { primary: true } }], phoneNumbers: [{ value: '+7 999 111-22-33', type: 'mobile' }], organizations: [{ name: 'Acme', title: 'CEO' }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const service = new GoogleContactsService(store, { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost/callback' }, fakeFetch as typeof fetch);

    try {
      const authorizationUrl = new URL(service.createAuthorizationUrl());
      expect(authorizationUrl.searchParams.get('scope')).toContain('contacts.readonly');
      expect(authorizationUrl.searchParams.get('access_type')).toBe('offline');
      await service.completeAuthorization('code', authorizationUrl.searchParams.get('state')!);
      expect((await service.status()).connected).toBe(true);
      expect((await stat(path.join(directory, 'google-contacts-token.json'))).mode & 0o777).toBe(0o600);
      const contacts = await service.listContacts();
      expect(contacts[0]).toMatchObject({ displayName: 'Анна Волкова', familyName: 'Волкова', organizations: [{ name: 'Acme', title: 'CEO', department: '' }] });
      expect(requests.some((url) => url.includes('personFields='))).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refreshes an expired access token before loading contacts', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'google-refresh-'));
    const store = new GoogleTokenStore(directory);
    await store.save({ accessToken: 'expired', refreshToken: 'refresh', expiresAt: 1, scope: '', tokenType: 'Bearer' });
    let refreshCalls = 0;
    const fakeFetch = async (input: string | URL | Request) => {
      if (String(input).includes('/token')) {
        refreshCalls += 1;
        return new Response(JSON.stringify({ access_token: 'renewed', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ connections: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const service = new GoogleContactsService(store, { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost/callback' }, fakeFetch as typeof fetch);
    try {
      await service.listContacts();
      expect(refreshCalls).toBe(1);
      expect((await store.load())?.accessToken).toBe('renewed');
      expect((await store.load())?.refreshToken).toBe('refresh');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects an unknown OAuth state', async () => {
    const service = new GoogleContactsService(new GoogleTokenStore('/tmp/google-state-test'), { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost/callback' });
    await expect(service.completeAuthorization('code', 'unknown')).rejects.toThrow('Сессия подключения Google устарела');
  });

  it('ignores malformed contacts without a resource name', () => {
    expect(normalizeGoogleContact({ names: [{ displayName: 'Без ID' }] })).toBeUndefined();
  });
});
