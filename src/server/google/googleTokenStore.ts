import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const googleTokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.number().int().nonnegative(),
  scope: z.string().default(''),
  tokenType: z.string().default('Bearer'),
});

export type GoogleTokens = z.infer<typeof googleTokenSchema>;

export class GoogleTokenStore {
  private readonly filePath: string;

  constructor(dataDirectory = path.join(process.cwd(), 'data')) {
    this.filePath = path.join(dataDirectory, 'google-contacts-token.json');
  }

  async load(): Promise<GoogleTokens | undefined> {
    try {
      return googleTokenSchema.parse(JSON.parse(await readFile(this.filePath, 'utf8')));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async save(tokens: GoogleTokens): Promise<GoogleTokens> {
    const parsed = googleTokenSchema.parse(tokens);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.filePath);
    return parsed;
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
