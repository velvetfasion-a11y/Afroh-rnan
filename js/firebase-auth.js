import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import { isAdminUser } from './admin-check.js';

function getFirebaseConfig() {
  return window.firebaseConfig;
}

export function isFirebaseConfigured() {
  const config = getFirebaseConfig();
  return config && config.apiKey && !config.apiKey.includes('YOUR_');
}

let auth = null;
let persistenceReady = false;

export function getFirebaseAuth() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Update js/firebase-config.js with your project settings.');
  }
  if (!auth) {
    const config = getFirebaseConfig();
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    auth = getAuth(app);
  }
  return auth;
}

export async function ensureAuthPersistence() {
  if (persistenceReady) return getFirebaseAuth();
  const a = getFirebaseAuth();
  await setPersistence(a, browserLocalPersistence);
  persistenceReady = true;
  return a;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
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
    'auth/invalid-credential': 'Fel e-post eller lösenord.',
    'auth/email-already-in-use': 'E-postadressen används redan.',
    'auth/weak-password': 'Lösenordet måste vara minst 6 tecken.',
    'auth/popup-closed-by-user': 'Google-inloggningen avbröts.',
    'auth/popup-blocked': 'Popup blockerades. Tillåt popups och försök igen.',
    'auth/cancelled-popup-request': 'Google-inloggningen avbröts.',
    'auth/account-exists-with-different-credential': 'E-postadressen är kopplad till ett annat inloggningssätt.',
    'auth/operation-not-allowed': 'Den här inloggningsmetoden är inte aktiverad i Firebase.',
    'auth/too-many-requests': 'För många försök. Försök igen om en stund.',
  };
  return messages[code] || 'Något gick fel. Försök igen.';
}

function safeNextPath(next) {
  if (!next || next.startsWith('http') || next.includes('..')) return null;
  return next;
}

export async function redirectAfterAuth(user) {
  const authUser = user || getFirebaseAuth().currentUser;
  try {
    if (authUser && (await isAdminUser(authUser))) {
      window.location.href = 'admin.html';
      return;
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

  ensureAuthPersistence()
    .then(() => {
      onAuthStateChanged(getFirebaseAuth(), async (user) => {
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
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

export function clearAuthError() {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
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

export function guardAuthPage() {
  if (!isFirebaseConfigured()) {
    showAuthError('Firebase är inte konfigurerat ännu. Kör node scripts/generate-firebase-config.mjs');
    return;
  }

  ensureAuthPersistence().then(() => {
    onAuthStateChanged(getFirebaseAuth(), async (user) => {
      if (user) await redirectAfterAuth(user);
    });
  }).catch((err) => {
    console.error('Firebase auth init failed:', err);
    showAuthError('Kunde inte ansluta till inloggningen. Ladda om sidan.');
  });
}

export function requireAuth(onUser, options = {}) {
  const { onError } = options;

  if (!isFirebaseConfigured()) {
    if (onError) onError(new Error('Firebase är inte konfigurerat.'));
    return;
  }

  ensureAuthPersistence()
    .then(() => {
      onAuthStateChanged(getFirebaseAuth(), async (user) => {
        if (!user) {
          const page = window.location.pathname.split('/').pop() || 'profile.html';
          window.location.href = `login.html?next=${encodeURIComponent(page)}`;
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

  ensureAuthPersistence().then(() => {
    onAuthStateChanged(getFirebaseAuth(), async (user) => {
      if (!user) {
        window.location.href = 'login.html?next=admin.html';
        return;
      }
      if (!(await isAdminUser(user))) {
        window.location.href = 'profile.html';
        return;
      }
      if (onUser) await onUser(user);
    });
  });
}
