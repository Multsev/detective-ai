import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const version = packageJson.version;

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`package.json version is not valid SemVer: ${version}`);
}
if (packageLock.version !== version || packageLock.packages?.['']?.version !== version) {
  throw new Error('package.json and package-lock.json versions do not match. Run npm install before release.');
}

console.log(`Version ${version} is consistent and valid SemVer.`);
