import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const forbiddenTrackedPaths = [
  /(^|\/)\.env(?:\.|$)(?!example$)/i,
  /(^|\/)data\//i,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)(?:credentials?|secrets?)(?:\.|\/|$)/i,
];

const secretPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['GitHub token', /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g],
  ['GitHub fine-grained token', /github_pat_[A-Za-z0-9_]{50,}/g],
  ['OpenAI-style secret key', /sk-[A-Za-z0-9_-]{24,}/g],
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/g],
  ['AWS access key', /AKIA[0-9A-Z]{16}/g],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{20,}/g],
];

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function scanText(text, location, findings) {
  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.add(`${location}: ${label}`);
  }
}

const trackedFiles = git(['ls-files', '-z']).split('\0').filter(Boolean);
const deletedFiles = new Set(git(['ls-files', '--deleted', '-z']).split('\0').filter(Boolean));
const findings = new Set();

for (const file of trackedFiles) {
  if (deletedFiles.has(file)) continue;
  if (forbiddenTrackedPaths.some((pattern) => pattern.test(file)) && file !== '.env.example') {
    findings.add(`${file}: sensitive path is tracked`);
  }
  try {
    const buffer = readFileSync(file);
    if (!buffer.includes(0)) scanText(buffer.toString('utf8'), file, findings);
  } catch {
    findings.add(`${file}: tracked file cannot be inspected`);
  }
}

if (process.argv.includes('--history')) {
  const historicalPaths = git(['log', '--all', '--format=', '--name-only']).split('\n').filter(Boolean);
  for (const file of historicalPaths) {
    if (forbiddenTrackedPaths.some((pattern) => pattern.test(file)) && file !== '.env.example') {
      findings.add(`Git history (${file}): sensitive path was tracked`);
    }
  }
  scanText(git(['log', '-p', '--all', '--full-history', '--no-ext-diff', '--no-textconv']), 'Git history', findings);
}

if (findings.size) {
  console.error('Potential publication blockers found:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Secret scan passed for ${trackedFiles.length} tracked files${process.argv.includes('--history') ? ' and Git history' : ''}.`);
