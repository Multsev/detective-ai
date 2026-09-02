import { createHash, randomBytes } from 'node:crypto';
import type { GoogleContact, GoogleIntegrationStatus } from '../../shared/domain.js';
import { GoogleTokenStore, type GoogleTokens } from './googleTokenStore.js';

export const googleContactsReadonlyScope = 'https://www.googleapis.com/auth/contacts.readonly';
export const defaultGoogleDesktopClientId = '840778971863-ncu3dbv7i3rvlb4g69cl4ed1cg2n0vql.apps.googleusercontent.com';
const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const revokeEndpoint = 'https://oauth2.googleapis.com/revoke';
const peopleEndpoint = 'https://people.googleapis.com/v1/people/me/connections';
const personFields = 'names,nicknames,phoneNumbers,emailAddresses,organizations,biographies,userDefined,urls';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

interface AuthorizationSession {
  codeVerifier: string;
  expiresAt: number;
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
  const clientId = environment.GOOGLE_CLIENT_ID?.trim() || defaultGoogleDesktopClientId;
  const clientSecret = environment.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId) return undefined;
  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
    redirectUri: environment.GOOGLE_REDIRECT_URI?.trim() || `http://127.0.0.1:${environment.PORT?.trim() || '8787'}/api/google/oauth/callback`,
  };
}

export class GoogleContactsService {
  private readonly authorizationSessions = new Map<string, AuthorizationSession>();
  private lastAuthorizationError?: string;

  constructor(
    private readonly tokenStore = new GoogleTokenStore(),
    private readonly config = loadGoogleOAuthConfig(),
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async status(): Promise<GoogleIntegrationStatus> {
    if (!this.config) return { configured: false, connected: false, scope: googleContactsReadonlyScope, message: 'OAuth-клиент Google не настроен.' };
    const tokens = await this.tokenStore.load();
    return {
      configured: true,
      connected: Boolean(tokens?.accessToken),
      scope: googleContactsReadonlyScope,
      message: tokens?.accessToken
        ? `Google Контакты подключены в режиме чтения. Токен хранится ${this.tokenStore.storageLabel}.`
        : this.lastAuthorizationError || 'Нажмите «Подключить Google» и разрешите чтение контактов.',
    };
  }

  createAuthorizationUrl(): string {
    const config = this.requireConfig();
    this.lastAuthorizationError = undefined;
    this.removeExpiredStates();
    const state = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(64).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    this.authorizationSessions.set(state, { codeVerifier, expiresAt: Date.now() + 10 * 60 * 1000 });
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: googleContactsReadonlyScope,
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent select_account',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    }).toString();
    return url.toString();
  }

  async completeAuthorization(code: string, returnedState: string): Promise<void> {
    const session = this.consumeAuthorizationState(returnedState);
    if (!session) throw new Error('Сессия подключения Google устарела. Запустите подключение ещё раз.');
    const config = this.requireConfig();
    const parameters = new URLSearchParams({ code, client_id: config.clientId, code_verifier: session.codeVerifier, redirect_uri: config.redirectUri, grant_type: 'authorization_code' });
    if (config.clientSecret) parameters.set('client_secret', config.clientSecret);
    const response = await this.fetcher(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: parameters,
    });
    const payload = await response.json() as GoogleTokenResponse;
    if (!response.ok || !payload.access_token) {
      const message = payload.error_description === 'client_secret is missing.'
        ? 'Для этого Desktop OAuth-клиента Google требуется Client Secret. Добавьте его как GOOGLE_CLIENT_SECRET в локальный файл .env и перезапустите приложение.'
        : payload.error_description || 'Google не вернул токен доступа.';
      this.recordAuthorizationFailure(message);
      throw new Error(message);
    }
    await this.tokenStore.save(this.toStoredTokens(payload));
    this.lastAuthorizationError = undefined;
  }

  recordAuthorizationFailure(message: string): void {
    this.lastAuthorizationError = message;
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
    if (!this.config) throw new Error('OAuth-клиент Google недоступен в этой сборке.');
    return this.config;
  }

  private consumeAuthorizationState(returnedState: string): AuthorizationSession | undefined {
    const session = this.authorizationSessions.get(returnedState);
    this.authorizationSessions.delete(returnedState);
    return session && session.expiresAt >= Date.now() ? session : undefined;
  }

  private removeExpiredStates(): void {
    const now = Date.now();
    for (const [state, session] of this.authorizationSessions) if (session.expiresAt < now) this.authorizationSessions.delete(state);
  }

  private async getAccessToken(): Promise<string> {
    const tokens = await this.tokenStore.load();
    if (!tokens) throw new Error('Google Contacts не подключён. Откройте настройки и подключите аккаунт.');
    if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
    if (!tokens.refreshToken) throw new Error('Срок доступа Google истёк. Подключите аккаунт повторно.');
    const config = this.requireConfig();
    const parameters = new URLSearchParams({ client_id: config.clientId, refresh_token: tokens.refreshToken, grant_type: 'refresh_token' });
    if (config.clientSecret) parameters.set('client_secret', config.clientSecret);
    const response = await this.fetcher(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: parameters,
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
