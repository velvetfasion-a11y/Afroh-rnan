import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const outPath = join(root, 'js', 'stripe-config.js');

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

const env = loadEnv(envPath);
const publishableKey = env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const projectId = env.VITE_FIREBASE_PROJECT_ID || 'afrohornan';
const checkoutApiUrl =
  env.VITE_STRIPE_CHECKOUT_URL ||
  `https://europe-west1-${projectId}.cloudfunctions.net/createPaymentIntent`;
const configured =
  publishableKey &&
  !publishableKey.includes('your_publishable_key') &&
  publishableKey.startsWith('pk_');

const output = `// Auto-generated from .env — do not edit manually.
// Run: node scripts/generate-env.mjs
window.stripeConfig = {
  publishableKey: ${JSON.stringify(configured ? publishableKey : '')},
  configured: ${configured},
  checkoutApiUrl: ${JSON.stringify(checkoutApiUrl)},
};
`;

writeFileSync(outPath, output);

if (configured) {
  console.log('Generated js/stripe-config.js');
} else {
  console.warn('Stripe publishable key missing or placeholder — js/stripe-config.js has configured: false');
  console.warn('Set VITE_STRIPE_PUBLISHABLE_KEY in .env (pk_test_... or pk_live_...)');
}
