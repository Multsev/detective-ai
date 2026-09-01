import { randomBytes } from 'node:crypto';
import type { GoogleContact, GoogleIntegrationStatus } from '../../shared/domain.js';
import { GoogleTokenStore, type GoogleTokens } from './googleTokenStore.js';

export const googleContactsReadonlyScope = 'https://www.googleapis.com/auth/contacts.readonly';
const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const revokeEndpoint = 'https://oauth2.googleapis.com/revoke';
const peopleEndpoint = 'https://people.googleapis.com/v1/people/me/connections';
const personFields = 'names,nicknames,phoneNumbers,emailAddresses,organizations,biographies,userDefined,urls';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

type Fetcher = typeof fetch;

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GooglePersonValue {
  value?: string;
  type?: string;
}

interface GooglePerson {
  resourceName?: string;
  names?: Array<{ displayName?: string; givenName?: string; middleName?: string; familyName?: string; metadata?: { primary?: boolean } }>;
  nicknames?: Array<{ value?: string; metadata?: { primary?: boolean } }>;
  phoneNumbers?: GooglePersonValue[];
  emailAddresses?: GooglePersonValue[];
  organizations?: Array<{ name?: string; title?: string; department?: string }>;
  biographies?: Array<{ value?: string }>;
  userDefined?: Array<{ key?: string; value?: string }>;
  urls?: GooglePersonValue[];
}

interface ConnectionsResponse {
  connections?: GooglePerson[];
  nextPageToken?: string;
  error?: { message?: string; status?: string };
}

export function loadGoogleOAuthConfig(environment: NodeJS.ProcessEnv = process.env): GoogleOAuthConfig | undefined {
  const clientId = environment.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = environment.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;
  return {
    clientId,
    clientSecret,
    redirectUri: environment.GOOGLE_REDIRECT_URI?.trim() || `http://localhost:${environment.PORT?.trim() || '8787'}/api/google/oauth/callback`,
  };
}

export class GoogleContactsService {
  private readonly authorizationStates = new Map<string, number>();

  constructor(
    private readonly tokenStore = new GoogleTokenStore(),
    private readonly config = loadGoogleOAuthConfig(),
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async status(): Promise<GoogleIntegrationStatus> {
    if (!this.config) return { configured: false, connected: false, scope: googleContactsReadonlyScope, message: 'Укажите GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.' };
    const tokens = await this.tokenStore.load();
    return {
      configured: true,
      connected: Boolean(tokens?.accessToken),
      scope: googleContactsReadonlyScope,
      message: tokens?.accessToken ? 'Google Contacts подключён в режиме чтения.' : 'OAuth-клиент настроен. Подключите аккаунт Google.',
    };
  }

  createAuthorizationUrl(): string {
    const config = this.requireConfig();
    this.removeExpiredStates();
    const state = randomBytes(24).toString('base64url');
    this.authorizationStates.set(state, Date.now() + 10 * 60 * 1000);
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: googleContactsReadonlyScope,
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    }).toString();
    return url.toString();
  }

  async completeAuthorization(code: string, returnedState: string): Promise<void> {
    if (!this.consumeAuthorizationState(returnedState)) throw new Error('Сессия подключения Google устарела. Запустите подключение ещё раз.');
    const config = this.requireConfig();
    const response = await this.fetcher(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: 'authorization_code' }),
    });
    const payload = await response.json() as GoogleTokenResponse;
    if (!response.ok || !payload.access_token) throw new Error(payload.error_description || 'Google не вернул токен доступа.');
    await this.tokenStore.save(this.toStoredTokens(payload));
  }

  async listContacts(): Promise<GoogleContact[]> {
    const accessToken = await this.getAccessToken();
    const contacts: GoogleContact[] = [];
    let pageToken = '';
    const visitedPageTokens = new Set<string>();
    do {
      if (visitedPageTokens.has(pageToken)) throw new Error('Google People API вернул повторяющуюся страницу контактов.');
      visitedPageTokens.add(pageToken);
      const url = new URL(peopleEndpoint);
      url.search = new URLSearchParams({ personFields, pageSize: '1000', sortOrder: 'FIRST_NAME_ASCENDING', ...(pageToken ? { pageToken } : {}) }).toString();
      const response = await this.fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const payload = await response.json() as ConnectionsResponse;
      if (!response.ok) throw new Error(payload.error?.message || 'Не удалось загрузить Google Контакты. Подключите аккаунт повторно.');
      contacts.push(...(payload.connections ?? []).map(normalizeGoogleContact).filter((contact): contact is GoogleContact => Boolean(contact)));
      pageToken = payload.nextPageToken ?? '';
      if (visitedPageTokens.size >= 20 && pageToken) throw new Error('В аккаунте слишком много страниц контактов для одного импорта.');
    } while (pageToken);
    return contacts;
  }

  async disconnect(): Promise<void> {
    const tokens = await this.tokenStore.load();
    const token = tokens?.refreshToken || tokens?.accessToken;
    if (token) {
      try {
        await this.fetcher(revokeEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }),
        });
      } catch {
        // Local removal must still work if Google is temporarily unavailable.
      }
    }
    await this.tokenStore.clear();
  }

  private requireConfig(): GoogleOAuthConfig {
    if (!this.config) throw new Error('Google OAuth не настроен. Укажите GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.');
    return this.config;
  }

  private consumeAuthorizationState(returnedState: string): boolean {
    const expiresAt = this.authorizationStates.get(returnedState);
    this.authorizationStates.delete(returnedState);
    return Boolean(expiresAt && expiresAt >= Date.now());
  }

  private removeExpiredStates(): void {
    const now = Date.now();
    for (const [state, expiresAt] of this.authorizationStates) if (expiresAt < now) this.authorizationStates.delete(state);
  }

  private async getAccessToken(): Promise<string> {
    const tokens = await this.tokenStore.load();
    if (!tokens) throw new Error('Google Contacts не подключён. Откройте настройки и подключите аккаунт.');
    if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
    if (!tokens.refreshToken) throw new Error('Срок доступа Google истёк. Подключите аккаунт повторно.');
    const config = this.requireConfig();
    const response = await this.fetcher(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: tokens.refreshToken, grant_type: 'refresh_token' }),
    });
    const payload = await response.json() as GoogleTokenResponse;
    if (!response.ok || !payload.access_token) throw new Error(payload.error_description || 'Не удалось обновить доступ к Google Contacts.');
    const refreshed = await this.tokenStore.save(this.toStoredTokens(payload, tokens.refreshToken));
    return refreshed.accessToken;
  }

  private toStoredTokens(payload: GoogleTokenResponse, fallbackRefreshToken?: string): GoogleTokens {
    return {
      accessToken: payload.access_token!,
      refreshToken: payload.refresh_token || fallbackRefreshToken,
      expiresAt: Date.now() + Math.max(0, payload.expires_in ?? 3600) * 1000,
      scope: payload.scope || googleContactsReadonlyScope,
      tokenType: payload.token_type || 'Bearer',
    };
  }
}

export function normalizeGoogleContact(person: GooglePerson): GoogleContact | undefined {
  if (!person.resourceName) return undefined;
  const primaryName = person.names?.find((name) => name.metadata?.primary) ?? person.names?.[0];
  const displayName = primaryName?.displayName?.trim() || [primaryName?.familyName, primaryName?.givenName, primaryName?.middleName].filter(Boolean).join(' ').trim() || 'Контакт без имени';
  const values = (items: GooglePersonValue[] | undefined) => (items ?? [])
    .map((item) => ({ value: item.value?.trim() ?? '', type: item.type?.trim() ?? '' }))
    .filter((item) => item.value);
  return {
    id: person.resourceName.replace(/^people\//, ''),
    resourceName: person.resourceName,
    displayName,
    givenName: primaryName?.givenName?.trim() ?? '',
    middleName: primaryName?.middleName?.trim() ?? '',
    familyName: primaryName?.familyName?.trim() ?? '',
    nickname: (person.nicknames?.find((nickname) => nickname.metadata?.primary) ?? person.nicknames?.[0])?.value?.trim() ?? '',
    phoneNumbers: values(person.phoneNumbers),
    emailAddresses: values(person.emailAddresses),
    organizations: (person.organizations ?? []).map((organization) => ({ name: organization.name?.trim() ?? '', title: organization.title?.trim() ?? '', department: organization.department?.trim() ?? '' })).filter((organization) => organization.name || organization.title || organization.department),
    biographies: (person.biographies ?? []).map((biography) => biography.value?.trim() ?? '').filter(Boolean),
    userDefined: (person.userDefined ?? []).map((field) => ({ key: field.key?.trim() ?? '', value: field.value?.trim() ?? '' })).filter((field) => field.key || field.value),
    urls: values(person.urls),
  };
}
