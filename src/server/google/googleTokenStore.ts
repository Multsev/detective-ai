import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { userInfo } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const googleTokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.number().int().nonnegative(),
  scope: z.string().default(''),
  tokenType: z.string().default('Bearer'),
});

export type GoogleTokens = z.infer<typeof googleTokenSchema>;

const execFileAsync = promisify(execFile);

class FileGoogleTokenStore {
  constructor(private readonly filePath: string) {}

  async load() {
    try {
      return googleTokenSchema.parse(JSON.parse(await readFile(this.filePath, 'utf8')));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async save(tokens: GoogleTokens) {
    const parsed = googleTokenSchema.parse(tokens);
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await chmod(path.dirname(this.filePath), 0o700);
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.filePath);
    await chmod(this.filePath, 0o600);
    return parsed;
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}

class MacOSKeychainGoogleTokenStore {
  private readonly service = 'ai.detective.google-contacts';
  private readonly account = `${userInfo().username}:oauth`;

  async load(): Promise<GoogleTokens | undefined> {
    try {
      const { stdout } = await execFileAsync('/usr/bin/security', ['find-generic-password', '-a', this.account, '-s', this.service, '-w'], { encoding: 'utf8' });
      return googleTokenSchema.parse(JSON.parse(stdout.trim()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/could not be found|The specified item could not be found|SecKeychainSearchCopyNext/i.test(message)) return undefined;
      throw new Error(`Не удалось прочитать токен Google из Связки ключей: ${message}`);
    }
  }

  async save(tokens: GoogleTokens): Promise<GoogleTokens> {
    const parsed = googleTokenSchema.parse(tokens);
    await execFileAsync('/usr/bin/security', ['add-generic-password', '-U', '-a', this.account, '-s', this.service, '-w', JSON.stringify(parsed)], { encoding: 'utf8' });
    return parsed;
  }

  async clear(): Promise<void> {
    try {
      await execFileAsync('/usr/bin/security', ['delete-generic-password', '-a', this.account, '-s', this.service], { encoding: 'utf8' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/could not be found|The specified item could not be found|SecKeychainSearchCopyNext/i.test(message)) throw error;
    }
  }
}

export class GoogleTokenStore {
  private readonly fileStore: FileGoogleTokenStore;
  private readonly keychainStore?: MacOSKeychainGoogleTokenStore;
  readonly storageLabel: string;

  constructor(dataDirectory?: string) {
    this.fileStore = new FileGoogleTokenStore(path.join(dataDirectory ?? path.join(process.cwd(), 'data'), 'google-contacts-token.json'));
    this.keychainStore = dataDirectory === undefined && process.platform === 'darwin' ? new MacOSKeychainGoogleTokenStore() : undefined;
    this.storageLabel = this.keychainStore ? 'в системной Связке ключей' : 'в локальном файле с правами 0600';
  }

  async load(): Promise<GoogleTokens | undefined> {
    if (!this.keychainStore) return this.fileStore.load();
    const secured = await this.keychainStore.load();
    if (secured) return secured;
    const legacy = await this.fileStore.load();
    if (!legacy) return undefined;
    await this.keychainStore.save(legacy);
    await this.fileStore.clear();
    return legacy;
  }

  async save(tokens: GoogleTokens): Promise<GoogleTokens> {
    if (!this.keychainStore) return this.fileStore.save(tokens);
    const saved = await this.keychainStore.save(tokens);
    await this.fileStore.clear();
    return saved;
  }

  async clear(): Promise<void> {
    await this.keychainStore?.clear();
    await this.fileStore.clear();
  }
}
