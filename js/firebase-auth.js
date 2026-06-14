import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

const config = window.firebaseConfig;

export function isFirebaseConfigured() {
  return config && config.apiKey && !config.apiKey.includes('YOUR_');
}

let auth = null;

export function getFirebaseAuth() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Update js/firebase-config.js with your project settings.');
  }
  if (!auth) {
    const app = initializeApp(config);
    auth = getAuth(app);
  }
  return auth;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  onAuthStateChanged,
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

export function redirectAfterAuth() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  window.location.href = next && !next.startsWith('http') ? next : 'index.html';
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
    showAuthError('Firebase är inte konfigurerat ännu. Klistra in dina uppgifter i js/firebase-config.js.');
    return;
  }

  onAuthStateChanged(getFirebaseAuth(), (user) => {
    if (user) redirectAfterAuth();
  });
}
