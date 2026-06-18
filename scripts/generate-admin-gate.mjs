import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const outPath = join(root, 'js', 'admin-gate.js');

function loadEnv(file) {
  const env = {};
  if (!existsSync(file)) return env;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    });
  return env;
}

const raw = loadEnv(envPath).VITE_ADMIN_EMAIL;
const emails = (raw || '')
  .split(/[,;]/)
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (!emails.length || emails.some((e) => e.includes('your_') || e.includes('@example'))) {
  console.error('Missing VITE_ADMIN_EMAIL in .env (comma-separated for multiple admins)');
  process.exit(1);
}

const hashes = emails.map((email) =>
  createHash('sha256').update(email).digest('hex')
);

const lines = [
  '// Auto-generated from .env — do not edit. Contains no plaintext email.',
  `window.__adminEmailHashes = ${JSON.stringify(hashes)};`,
  `window.__adminEmailHash = ${JSON.stringify(hashes[0])};`,
  '',
];

writeFileSync(outPath, `${lines.join('\n')}`);

console.log(`Generated js/admin-gate.js (${hashes.length} admin email hash${hashes.length === 1 ? '' : 'es'})`);
