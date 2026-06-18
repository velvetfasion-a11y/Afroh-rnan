import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const outPath = join(root, 'js', 'firebase-config.js');

const KEYS = [
  ['VITE_FIREBASE_API_KEY', 'apiKey'],
  ['VITE_FIREBASE_AUTH_DOMAIN', 'authDomain'],
  ['VITE_FIREBASE_PROJECT_ID', 'projectId'],
  ['VITE_FIREBASE_STORAGE_BUCKET', 'storageBucket'],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', 'messagingSenderId'],
  ['VITE_FIREBASE_APP_ID', 'appId'],
  ['VITE_FIREBASE_MEASUREMENT_ID', 'measurementId'],
];

const REQUIRED = KEYS.slice(0, 6);

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
const missing = REQUIRED.filter(([envKey]) => !env[envKey] || env[envKey].includes('your_'));

if (missing.length === REQUIRED.length) {
  console.error('No Firebase values found in .env');
  console.error('1. Copy .env.example to .env');
  console.error('2. Paste your Firebase web app config values');
  console.error('3. Run this script again');
  process.exit(1);
}

if (missing.length) {
  console.warn('Warning: missing or placeholder values for:');
  missing.forEach(([key]) => console.warn(`  - ${key}`));
}

const config = Object.fromEntries(
  KEYS.filter(([, jsKey], i) => env[KEYS[i][0]]).map(([envKey, jsKey]) => [jsKey, env[envKey]])
);

const output = `// Auto-generated from .env — do not edit manually.
// Run: node scripts/generate-firebase-config.mjs
(function () {
  var hostname = window.location.hostname;
  var isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
  function clearEmulatorDefaults() {
    try {
      document.cookie = '__FIREBASE_DEFAULTS__=; Max-Age=0; path=/';
      document.cookie = '__FIREBASE_DEFAULTS__=; Max-Age=0; path=/; domain=' + hostname;
      if (hostname.indexOf('.') !== -1) {
        document.cookie = '__FIREBASE_DEFAULTS__=; Max-Age=0; path=/; domain=.' + hostname.replace(/^www\\./, '');
      }
    } catch (_) {}
    try { delete window.__FIREBASE_DEFAULTS__; } catch (_) { window.__FIREBASE_DEFAULTS__ = undefined; }
  }
  if (!isLocalDev) clearEmulatorDefaults();
  window.AfroSite = {
    isLocalDev: isLocalDev,
    hostname: hostname,
    origin: window.location.origin,
    checkoutApiUrl: isLocalDev ? null : 'https://europe-west1-afrohornan.cloudfunctions.net/createPaymentIntent',
    pickupApiUrl: isLocalDev ? null : 'https://europe-west1-afrohornan.cloudfunctions.net/createPickupOrder',
    useFirebaseEmulators: false,
    clearEmulatorDefaults: clearEmulatorDefaults,
  };
})();
window.firebaseConfig = ${JSON.stringify(config, null, 2)};
`;

writeFileSync(outPath, output);
console.log('Generated js/firebase-config.js');
