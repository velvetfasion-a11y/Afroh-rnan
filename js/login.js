import {
  getFirebaseAuth,
  googleProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  authErrorMessage,
  redirectAfterAuth,
  showAuthError,
  clearAuthError,
  setButtonLoading,
  setGoogleLoading,
  guardAuthPage,
  isFirebaseConfigured,
  ensureAuthPersistence,
} from './firebase-auth.js';

guardAuthPage();

document.getElementById('googleLogin').addEventListener('click', async () => {
  clearAuthError();
  const button = document.getElementById('googleLogin');
  if (!isFirebaseConfigured()) {
    showAuthError('Firebase är inte konfigurerat ännu. Kör node scripts/generate-firebase-config.mjs');
    return;
  }

  setGoogleLoading(button, true);
  try {
    await ensureAuthPersistence();
    const result = await signInWithPopup(getFirebaseAuth(), googleProvider);
    await redirectAfterAuth(result.user);
  } catch (error) {
    if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
      showAuthError(authErrorMessage(error.code));
    }
  } finally {
    setGoogleLoading(button, false);
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthError();

  if (!isFirebaseConfigured()) {
    showAuthError('Firebase är inte konfigurerat ännu. Kör node scripts/generate-firebase-config.mjs');
    return;
  }

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const button = e.target.querySelector('.auth-submit');

  setButtonLoading(button, true, 'Loggar in…');
  try {
    await ensureAuthPersistence();
    const result = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    await redirectAfterAuth(result.user);
  } catch (error) {
    showAuthError(authErrorMessage(error.code));
  } finally {
    setButtonLoading(button, false);
  }
});
