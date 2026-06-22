/**
 * Afrohörnan – Firebase Authentication
 *
 * ── Firebase Console (obligatoriskt) ─────────────────────────────────────
 * 1. Authentication → Sign-in method → aktivera "Google" och "Email/Password"
 * 2. Authentication → Settings → Authorized domains – lägg till:
 *    • afrohornan.com
 *    • www.afrohornan.com
 *    • afrohornan.web.app
 *    • afrohornan.firebaseapp.com
 *    • localhost (för lokal utveckling)
 *
 * ── Google Cloud Console ─────────────────────────────────────────────────
 * APIs & Services → Credentials → "Web client (auto created by Google Service)"
 * Under "Authorized JavaScript origins", lägg till samma https://-domäner.
 * Kontrollera att API-nyckeln INTE har HTTP referrer-begränsningar som blockerar
 * identitytoolkit.googleapis.com (Firebase Auth).
 *
 * ── Hosting ──────────────────────────────────────────────────────────────
 * • afrohornan.com (GitHub Pages): använd signInWithPopup – redirect blockeras i Safari.
 * • För redirect på mobil: peka domänen till Firebase Hosting och sätt authDomain.
 *
 * Felsökning: lägg till ?authDebug=1 i URL:en för felkoder i bannern.
 */
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  updateProfile,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { isAdminUser, isFrisorAdminUser } from './admin-check.js?v=13';

function getFirebaseConfig() {
  return window.firebaseConfig;
}

export function isFirebaseConfigured() {
  const config = getFirebaseConfig();
  return config && config.apiKey && !config.apiKey.includes('YOUR_');
}

export function isLocalDev() {
  return window.AfroSite?.isLocalDev === true;
}

let app = null;
let auth = null;
let db = null;
let emulatorsWired = false;
let authReadyPromise = null;

const GOOGLE_REDIRECT_OK_HOSTS = new Set([
  'afrohornan.web.app',
  'afrohornan.firebaseapp.com',
  'localhost',
  '127.0.0.1',
]);

const GOOGLE_REDIRECT_KEY = 'afroPendingGoogleRedirect';
const GOOGLE_FORCE_POPUP_KEY = 'afroForceGooglePopup';
const AUTH_DEBUG = isLocalDev() || window.location.search.includes('authDebug=1');

let authBootstrapPromise = null;

export function logAuthError(context, error) {
  const payload = {
    context,
    code: error?.code ?? null,
    message: error?.message ?? String(error),
    customData: error?.customData ?? null,
    serverResponse: error?.customData?.serverResponse ?? null,
    hostname: window.location.hostname,
    origin: window.location.origin,
  };
  console.error('[Afrohörnan Auth]', payload, error);
  return payload;
}

export function resolveAuthErrorCode(error) {
  if (!error) return '';
  if (typeof error === 'string') return error.startsWith('auth/') ? error : '';
  if (error.code) return error.code;

  const message = String(error.message || '');
  const server = error.customData?.serverResponse;
  const serverText = typeof server === 'string' ? server : JSON.stringify(server || '');
  const combined = `${message} ${serverText}`;

  const codeMatch = combined.match(/\b(auth\/[a-z0-9_-]+)\b/i);
  if (codeMatch) return codeMatch[1].toLowerCase();

  if (/API key not valid/i.test(combined)) return 'auth/invalid-api-key';
  if (/referer.*blocked|requests from referer/i.test(combined)) return 'auth/unauthorized-domain';
  if (/OPERATION_NOT_ALLOWED/i.test(combined)) return 'auth/operation-not-allowed';
  if (/UNAUTHORIZED_DOMAIN/i.test(combined)) return 'auth/unauthorized-domain';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(combined)) return 'auth/network-request-failed';
  return '';
}

export function formatAuthError(error) {
  const code = resolveAuthErrorCode(error);
  logAuthError('formatAuthError', error);

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return null;
  }

  return authErrorMessage(code, error);
}

export function bootstrapAuth() {
  if (authBootstrapPromise) return authBootstrapPromise;

  authBootstrapPromise = (async () => {
    if (!isFirebaseConfigured()) return { auth: null, redirectHandled: false };

    const authInstance = await ensureAuthReady();
    let redirectHandled = false;

    try {
      redirectHandled = await finishGoogleRedirect(authInstance);
    } catch (err) {
      logAuthError('Google redirect bootstrap', err);
    }

    return { auth: authInstance, redirectHandled };
  })();

  return authBootstrapPromise;
}

function canUseGoogleRedirect() {
  return GOOGLE_REDIRECT_OK_HOSTS.has(window.location.hostname);
}

/**
 * Popup måste startas direkt från klick – inget await före signInWithPopup (iOS Safari).
 * bootstrapAuth() körs redan vid sidladdning via initAuthPage().
 */
export function signInWithGoogle() {
  const authInstance = getFirebaseAuth();

  return signInWithPopup(authInstance, googleProvider)
    .then((result) => {
      try {
        sessionStorage.removeItem(GOOGLE_FORCE_POPUP_KEY);
      } catch {
        /* ignore */
      }
      return result.user;
    })
    .catch((error) => {
      const code = resolveAuthErrorCode(error);
      const tryRedirect =
        canUseGoogleRedirect() &&
        (code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment' ||
          code === 'auth/internal-error');

      if (!tryRedirect) throw error;

      markGoogleRedirectPending();
      return signInWithRedirect(authInstance, googleProvider).then(() => null);
    });
}

export function resetGoogleButton(buttonId = 'googleLogin') {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.disabled = false;
  button.classList.remove('is-loading');
  button.removeAttribute('aria-busy');
  const label = button.querySelector('.btn-google-label');
  if (label?.dataset.originalText) {
    label.textContent = label.dataset.originalText;
  }
}

export function markGoogleRedirectPending() {
  try {
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY, '1');
  } catch {
    /* private mode */
  }
}

function consumeGoogleRedirectPending() {
  try {
    const pending = sessionStorage.getItem(GOOGLE_REDIRECT_KEY) === '1';
    sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
    return pending;
  } catch {
    return false;
  }
}

function hasGoogleRedirectPending() {
  try {
    return sessionStorage.getItem(GOOGLE_REDIRECT_KEY) === '1';
  } catch {
    return false;
  }
}

export function isGoogleRedirectPending() {
  return hasGoogleRedirectPending();
}

function shouldUseEmulators() {
  return isLocalDev() && window.AfroSite?.useFirebaseEmulators === true;
}

function wireEmulatorsIfNeeded() {
  if (emulatorsWired || !shouldUseEmulators() || !app) return;
  connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(getFirestore(app), '127.0.0.1', 8080);
  emulatorsWired = true;
}

export function getFirebaseApp() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Update js/firebase-config.js with your project settings.');
  }

  if (!isLocalDev()) {
    window.AfroSite?.clearEmulatorDefaults?.();
  }

  if (!app) {
    const config = getFirebaseConfig();
    app = getApps().length ? getApps()[0] : initializeApp(config);
    wireEmulatorsIfNeeded();
  }

  return app;
}

export function getFirebaseAuth() {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}

export function getFirestoreDb() {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}

export async function ensureAuthReady() {
  if (authReadyPromise) return authReadyPromise;

  authReadyPromise = (async () => {
    const authInstance = getFirebaseAuth();
    try {
      await authInstance.authStateReady();
    } catch {
      /* äldre SDK */
    }
    return authInstance;
  })();

  return authReadyPromise;
}

/** @deprecated */
export async function ensureAuthPersistence() {
  return ensureAuthReady();
}

export async function signInWithEmailPassword(email, password) {
  const authInstance = await ensureAuthReady();
  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await signInWithEmailAndPassword(authInstance, email, password);
    } catch (err) {
      lastError = err;
      if (err?.code !== 'auth/network-request-failed' || attempt === 1) throw err;
      await new Promise((resolve) => window.setTimeout(resolve, 600));
    }
  }

  throw lastError;
}

export async function sendPasswordReset(email) {
  const authInstance = await ensureAuthReady();
  const trimmed = String(email || '').trim();
  if (!trimmed) {
    const err = new Error('Missing email');
    err.code = 'auth/missing-email';
    throw err;
  }

  await sendPasswordResetEmail(authInstance, trimmed, {
    url: `${window.location.origin}${window.location.pathname}`,
  });
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile,
  onAuthStateChanged,
  signOut,
};

export function authErrorMessage(code, error) {
  const messages = {
    'auth/invalid-email': 'Ogiltig e-postadress.',
    'auth/user-disabled': 'Det här kontot är inaktiverat.',
    'auth/user-not-found': 'Inget konto hittades med den e-postadressen.',
    'auth/wrong-password': 'Fel lösenord.',
    'auth/invalid-credential': 'Fel e-post eller lösenord. Har du inget konto? Registrera dig först.',
    'auth/email-already-in-use': 'E-postadressen används redan.',
    'auth/weak-password': 'Lösenordet måste vara minst 6 tecken.',
    'auth/popup-closed-by-user': 'Google-inloggningen avbröts.',
    'auth/popup-blocked':
      'Popup-fönstret blockerades av webbläsaren. Tillåt popups för afrohornan.com och försök igen.',
    'auth/cancelled-popup-request': 'Google-inloggningen avbröts.',
    'auth/account-exists-with-different-credential':
      'E-postadressen är redan kopplad till ett annat inloggningssätt. Prova e-post och lösenord i stället.',
    'auth/operation-not-allowed':
      'Google-inloggning är inte aktiverad för tillfället.',
    'auth/too-many-requests': 'För många försök. Vänta en stund och försök igen.',
    'auth/unauthorized-domain':
      'Inloggning fungerar inte från den här webbadressen. Kontakta support.',
    'auth/invalid-api-key':
      'Firebase API-nyckeln är ogiltig eller begränsad. Kontakta support.',
    'auth/app-not-authorized':
      'Appen är inte auktoriserad för den här domänen. Kontakta support.',
    'auth/network-request-failed':
      'Kunde inte nå inloggningstjänsten. Kontrollera internetanslutningen och stäng av adblocker.',
    'auth/internal-error':
      'Inloggningen kunde inte slutföras. Ladda om sidan och försök igen.',
    'auth/missing-or-invalid-nonce':
      'Inloggningssessionen gick ut. Ladda om sidan och försök igen.',
    'auth/web-storage-unsupported':
      'Webbläsaren blockerar lagring som krävs för inloggning. Tillåt cookies och försök igen.',
    'auth/operation-not-supported-in-this-environment':
      'Google-inloggning stöds inte i den här webbläsaren. Prova Chrome eller Safari.',
    'auth/missing-email': 'Ange din e-postadress först.',
    'auth/credential-already-in-use':
      'Det här Google-kontot är redan kopplat till ett annat konto.',
    'auth/no-auth-event':
      'Google-inloggningen kunde inte slutföras. Försök igen.',
  };

  if (messages[code]) return messages[code];

  if (AUTH_DEBUG && error?.message) {
    return `Något gick fel. Försök igen. (${code || error.message})`;
  }

  if (code) {
    return `Något gick fel. Försök igen. (Felkod: ${code.replace(/^auth\//, '')})`;
  }

  return 'Något gick fel. Försök igen.';
}

function safeNextPath(next) {
  if (!next || next.startsWith('http') || next.includes('..')) return null;
  if (/localhost|127\.0\.0\.1/i.test(next)) return null;
  return next;
}

function loginUrl(nextPage) {
  const url = new URL('login.html', window.location.href);
  if (nextPage) url.searchParams.set('next', nextPage);
  return url.toString();
}

export async function resolvePostLoginUrl(user) {
  if (!user) return 'profile.html';
  if (isFrisorAdminUser(user)) return 'admin-frisor.html';
  try {
    if (await isAdminUser(user)) return 'admin.html';
  } catch (err) {
    console.warn('Admin check failed after login:', err);
  }
  const params = new URLSearchParams(window.location.search);
  return safeNextPath(params.get('next')) || 'profile.html';
}

export async function redirectAfterAuth(user) {
  const authInstance = getFirebaseAuth();
  const authUser = user || authInstance.currentUser;
  window.location.replace(await resolvePostLoginUrl(authUser));
}

export function wireNavProfile(options = {}) {
  const { basePath = '' } = options;
  if (!isFirebaseConfigured()) return;

  bootstrapAuth()
    .then(({ auth: authInstance }) => {
      if (!authInstance) return;
      onAuthStateChanged(authInstance, async (user) => {
        let href;
        let label;
        try {
          if (!user) {
            href = `${basePath}login.html`;
            label = 'Logga in';
          } else if (isFrisorAdminUser(user)) {
            href = `${basePath}admin-frisor.html`;
            label = 'Frisör admin';
          } else if (await isAdminUser(user)) {
            href = `${basePath}admin.html`;
            label = 'Admin';
          } else {
            href = `${basePath}profile.html`;
            label = 'Mitt konto';
          }
        } catch {
          href = user ? `${basePath}profile.html` : `${basePath}login.html`;
          label = user ? 'Mitt konto' : 'Logga in';
        }
        document.querySelectorAll('.nav-profile').forEach((link) => {
          link.href = href;
          link.setAttribute('aria-label', label);
        });
      });
    })
    .catch((err) => logAuthError('Nav profile auth init', err));
}

export function showAuthError(message) {
  const el = document.getElementById('authError');
  const success = document.getElementById('authSuccess');
  if (success) {
    success.textContent = '';
    success.hidden = true;
  }
  if (!el || !message) return;
  el.textContent = message;
  el.hidden = false;
}

export function showAuthSuccess(message) {
  const el = document.getElementById('authSuccess');
  const error = document.getElementById('authError');
  if (error) {
    error.textContent = '';
    error.hidden = true;
  }
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

export function clearAuthError() {
  const el = document.getElementById('authError');
  const success = document.getElementById('authSuccess');
  if (el) {
    el.textContent = '';
    el.hidden = true;
  }
  if (success) {
    success.textContent = '';
    success.hidden = true;
  }
}

export function setButtonLoading(button, loading, loadingText) {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent.trim();
    button.disabled = true;
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

export function setGoogleLoading(button, loading) {
  if (!button) return;
  const label = button.querySelector('.btn-google-label');
  if (!label) return;

  if (loading) {
    if (!label.dataset.originalText) {
      label.dataset.originalText = label.textContent;
    }
    label.textContent = 'Ansluter till Google…';
    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
  } else {
    label.textContent = label.dataset.originalText || 'Logga in med Google';
    button.disabled = false;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
  }
}

function customDomainRedirectHelp() {
  if (canUseGoogleRedirect()) {
    return 'Google-inloggningen kunde inte slutföras. Försök igen.';
  }
  return (
    'Google-inloggningen kunde inte slutföras. Tillåt popups för sidan och försök igen, ' +
    'eller öppna afrohornan.web.app/login.html.'
  );
}

function markForceGooglePopup() {
  try {
    sessionStorage.setItem(GOOGLE_FORCE_POPUP_KEY, '1');
  } catch {
    /* ignore */
  }
}

async function waitForAuthUser(authInstance, maxMs = 3000) {
  if (authInstance.currentUser) return authInstance.currentUser;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (user) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      resolve(user);
    };

    const unsubscribe = onAuthStateChanged(authInstance, (user) => {
      if (user) finish(user);
    });

    const interval = window.setInterval(() => {
      if (authInstance.currentUser) finish(authInstance.currentUser);
    }, 200);

    const timeout = window.setTimeout(() => finish(authInstance.currentUser || null), maxMs);
  });
}

async function finishGoogleRedirect(authInstance) {
  const pendingGoogle = hasGoogleRedirectPending();
  await authInstance.authStateReady();

  try {
    const result = await getRedirectResult(authInstance);
    if (pendingGoogle) consumeGoogleRedirectPending();

    let user = result?.user || null;
    if (!user && pendingGoogle) {
      user = await waitForAuthUser(authInstance, 3000);
    }

    if (user) {
      await redirectAfterAuth(user);
      return true;
    }

    if (pendingGoogle) {
      markForceGooglePopup();
      showAuthError(customDomainRedirectHelp());
    }
    return false;
  } catch (error) {
    if (pendingGoogle) consumeGoogleRedirectPending();
    logAuthError('Google redirect result', error);

    const user = authInstance.currentUser || (await waitForAuthUser(authInstance, 1500));
    if (user) {
      await redirectAfterAuth(user);
      return true;
    }

    if (pendingGoogle) {
      markForceGooglePopup();
      const message = formatAuthError(error) || customDomainRedirectHelp();
      showAuthError(message);
    }
    return false;
  }
}

export async function initAuthPage(options = {}) {
  const googleButtonId = options.googleButtonId || 'googleLogin';
  resetGoogleButton(googleButtonId);
  clearAuthError();

  if (!isFirebaseConfigured()) {
    showAuthError('Firebase är inte konfigurerat ännu. Kör node scripts/generate-firebase-config.mjs');
    return;
  }

  try {
    const { auth: authInstance, redirectHandled } = await bootstrapAuth();
    if (redirectHandled) return;

    if (authInstance?.currentUser) {
      await redirectAfterAuth(authInstance.currentUser);
    }
  } catch (err) {
    logAuthError('Auth page init', err);
    showAuthError('Kunde inte ansluta till inloggningen. Ladda om sidan och försök igen.');
    resetGoogleButton(googleButtonId);
  }
}

export function requireAuth(onUser, options = {}) {
  const { onError, onStateKnown } = options;

  if (!isFirebaseConfigured()) {
    if (onError) onError(new Error('Firebase är inte konfigurerat.'));
    return;
  }

  ensureAuthReady()
    .then(() => {
      onAuthStateChanged(getFirebaseAuth(), async (user) => {
        if (onStateKnown) onStateKnown(user);
        if (!user) {
          window.location.assign('login.html');
          return;
        }
        if (isFrisorAdminUser(user)) {
          window.location.replace('admin-frisor.html');
          return;
        }
        try {
          if (await isAdminUser(user)) {
            window.location.replace('admin.html');
            return;
          }
        } catch (err) {
          console.warn('Admin check failed on protected page:', err);
        }
        if (!onUser) return;
        try {
          await onUser(user);
        } catch (err) {
          logAuthError('requireAuth callback', err);
          if (onError) onError(err);
        }
      });
    })
    .catch((err) => {
      logAuthError('requireAuth init', err);
      if (onError) onError(err);
    });
}

export function requireAdmin(onUser) {
  if (!isFirebaseConfigured()) return;

  ensureAuthReady()
    .then(() => {
      onAuthStateChanged(getFirebaseAuth(), async (user) => {
        if (!user) {
          window.location.assign(loginUrl('admin.html'));
          return;
        }
        if (isFrisorAdminUser(user)) {
          window.location.href = 'admin-frisor.html';
          return;
        }
        if (!(await isAdminUser(user))) {
          window.location.href = 'profile.html';
          return;
        }
        if (onUser) await onUser(user);
      });
    })
    .catch((err) => logAuthError('requireAdmin init', err));
}

export function requireFrisorAdmin(onUser) {
  if (!isFirebaseConfigured()) return;

  ensureAuthReady()
    .then(() => {
      onAuthStateChanged(getFirebaseAuth(), async (user) => {
        if (!user) {
          window.location.assign('login.html');
          return;
        }
        if (!isFrisorAdminUser(user)) {
          if (await isAdminUser(user)) {
            window.location.href = 'admin.html';
          } else {
            window.location.href = 'profile.html';
          }
          return;
        }
        if (onUser) await onUser(user);
      });
    })
    .catch((err) => logAuthError('requireFrisorAdmin init', err));
}
