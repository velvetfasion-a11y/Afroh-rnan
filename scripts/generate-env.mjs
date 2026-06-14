import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const script of ['generate-firebase-config.mjs', 'generate-admin-gate.mjs']) {
  const result = spawnSync('node', [join(root, 'scripts', script)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('All env files generated.');
