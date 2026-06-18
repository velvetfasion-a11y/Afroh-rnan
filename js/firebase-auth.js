import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getAuth,
  initializeAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  updateProfile,
  onAuthStateChanged,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { isAdminUser } from './admin-check.js?v=11';

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
let persistenceReady = false;

const GOOGLE_REDIRECT_KEY = 'afroPendingGoogleRedirect';

let authBootstrapPromise = null;

export function bootstrapAuth() {
  if (authBootstrapPromise) return authBootstrapPromise;

  authBootstrapPromise = (async () => {
    if (!isFirebaseConfigured()) return { auth: null, redirectHandled: false };

    const authInstance = await ensureAuthPersistence();
    let redirectHandled = false;

    try {
      redirectHandled = await finishGoogleRedirect(authInstance);
    } catch (err) {
      console.error('Google redirect bootstrap failed:', err);
    }

    return { auth: authInstance, redirectHandled };
  })();

  return authBootstrapPromise;
}

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export async function signInWithGoogle() {
  const authInstance = await ensureAuthPersistence();
  if (isMobileDevice()) {
    markGoogleRedirectPending();
    await signInWithRedirect(authInstance, googleProvider);
    return null;
  }
  const result = await signInWithPopup(authInstance, googleProvider);
  return result.user;
}

export function resetGoogleButton(buttonId = 'googleLogin') {
  const button = document.getElementById(buttonId);
  if (!button) return;
  button.disabled = false;
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
    const firebaseApp = getFirebaseApp();
    try {
      auth = initializeAuth(firebaseApp, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
      });
    } catch (err) {
      if (err?.code === 'auth/already-initialized') {
        auth = getAuth(firebaseApp);
      } else {
        throw err;
      }
    }
  }
  return auth;
}

export function getFirestoreDb() {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}

export async function ensureAuthPersistence() {
  if (persistenceReady) return getFirebaseAuth();
  persistenceReady = true;
  return getFirebaseAuth();
}

export async function signInWithEmailPassword(email, password) {
  const auth = await ensureAuthPersistence();
  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      lastError = err;
      if (err?.code !== 'auth/network-request-failed' || attempt === 1) throw err;
      await new Promise((resolve) => window.setTimeout(resolve, 600));
    }
  }

  throw lastError;
}

export async function sendPasswordReset(email) {
  const authInstance = await ensureAuthPersistence();
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

export function authErrorMessage(code) {
  const messages = {
    'auth/invalid-email': 'Ogiltig e-postadress.',
    'auth/user-disabled': 'Det här kontot är inaktiverat.',
    'auth/user-not-found': 'Inget konto hittades med den e-postadressen.',
    'auth/wrong-password': 'Fel lösenord.',
    'auth/invalid-credential': 'Fel e-post eller lösenord. Har du inget konto? Registrera dig först.',
    'auth/email-already-in-use': 'E-postadressen används redan.',
    'auth/weak-password': 'Lösenordet måste vara minst 6 tecken.',
    'auth/popup-closed-by-user': 'Google-inloggningen avbröts.',
    'auth/popup-blocked': 'Popup blockerades. Tillåt popups och försök igen.',
    'auth/cancelled-popup-request': 'Google-inloggningen avbröts.',
    'auth/account-exists-with-different-credential': 'E-postadressen är kopplad till ett annat inloggningssätt.',
    'auth/operation-not-allowed': 'Den här inloggningsmetoden är inte aktiverad i Firebase.',
    'auth/too-many-requests': 'För många försök. Försök igen om en stund.',
    'auth/unauthorized-domain': 'Den här webbplatsen är inte tillåten för inloggning. Kontakta support.',
    'auth/network-request-failed':
      'Kunde inte nå inloggningstjänsten. Ladda om sidan och försök igen. Om felet kvarstår: stäng av adblocker och testa i ett annat webbläsarfönster.',
    'auth/internal-error': 'Inloggningen kunde inte slutföras. Ladda om sidan och försök igen.',
    'auth/missing-or-invalid-nonce': 'Inloggningssessionen gick ut. Ladda om sidan och försök igen.',
    'auth/web-storage-unsupported': 'Webbläsaren blockerar lagring som krävs för inloggning. Tillåt cookies och försök igen.',
    'auth/missing-email': 'Ange din e-postadress först.',
  };
  return messages[code] || 'Något gick fel. Försök igen.';
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

export async function redirectAfterAuth(user) {
  const auth = getFirebaseAuth();
  let authUser = user || auth.currentUser;
  try {
    if (authUser) {
      if (await isAdminUser(authUser)) {
        window.location.replace('admin.html');
        return;
      }
      // Google redirect can return before email is attached — retry once on currentUser.
      const refreshed = auth.currentUser;
      if (refreshed && refreshed.uid === authUser.uid && refreshed !== authUser) {
        if (await isAdminUser(refreshed)) {
          window.location.replace('admin.html');
          return;
        }
      }
    }
  } catch (err) {
    console.warn('Admin check failed after login:', err);
  }

  const params = new URLSearchParams(window.location.search);
  const next = safeNextPath(params.get('next')) || 'profile.html';
  window.location.href = next;
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
    .catch((err) => {
      console.error('Nav profile auth init failed:', err);
    });
}

export function showAuthError(message) {
  const el = document.getElementById('authError');
  const success = document.getElementById('authSuccess');
  if (success) {
    success.textContent = '';
    success.hidden = true;
  }
  if (!el) return;
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
    label.dataset.originalText = label.textContent;
    label.textContent = 'Ansluter…';
    button.disabled = true;
  } else {
    label.textContent = label.dataset.originalText || label.textContent;
    button.disabled = false;
  }
}

function shouldShowRedirectError(error, pendingGoogle) {
  if (!pendingGoogle) return false;
  if (!error?.code) return false;
  if (error.code === 'auth/network-request-failed') return false;
  if (error.code === 'auth/no-auth-event') return false;
  if (error.code === 'auth/internal-error') return false;
  return true;
}

async function finishGoogleRedirect(auth) {
  const pendingGoogle = hasGoogleRedirectPending();
  try {
    const result = await getRedirectResult(auth);
    consumeGoogleRedirectPending();
    if (result?.user) {
      await redirectAfterAuth(result.user);
      return true;
    }
    return false;
  } catch (error) {
    consumeGoogleRedirectPending();
    console.warn('Google redirect result:', error?.code, error?.message);
    if (shouldShowRedirectError(error, pendingGoogle)) {
      showAuthError(authErrorMessage(error.code));
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
    if (!authInstance || redirectHandled) return;

    onAuthStateChanged(authInstance, async (user) => {
      if (user) await redirectAfterAuth(user);
    });
  } catch (err) {
    console.error('Firebase auth init failed:', err);
    showAuthError('Kunde inte ansluta till inloggningen. Ladda om sidan.');
    resetGoogleButton(googleButtonId);
  }
}

/** @deprecated Use initAuthPage */
export function guardAuthPage() {
  initAuthPage();
}

export function requireAuth(onUser, options = {}) {
  const { onError, onStateKnown } = options;

  if (!isFirebaseConfigured()) {
    if (onError) onError(new Error('Firebase är inte konfigurerat.'));
    return;
  }

  ensureAuthPersistence()
    .then(() => {
      onAuthStateChanged(getFirebaseAuth(), async (user) => {
        if (onStateKnown) onStateKnown(user);
        if (!user) {
          const page = window.location.pathname.split('/').pop() || 'profile.html';
          window.location.assign(loginUrl(page));
          return;
        }
        if (!onUser) return;
        try {
          await onUser(user);
        } catch (err) {
          console.error('requireAuth callback failed:', err);
          if (onError) onError(err);
        }
      });
    })
    .catch((err) => {
      console.error('Firebase auth init failed:', err);
      if (onError) onError(err);
    });
}

export function requireAdmin(onUser) {
  if (!isFirebaseConfigured()) return;

  ensureAuthPersistence()
    .then(() => {
      onAuthStateChanged(getFirebaseAuth(), async (user) => {
        if (!user) {
          window.location.assign(loginUrl('admin.html'));
          return;
        }
        if (!(await isAdminUser(user))) {
          window.location.href = 'profile.html';
          return;
        }
        if (onUser) await onUser(user);
      });
    })
    .catch((err) => {
      console.error('Firebase admin auth init failed:', err);
    });
}
