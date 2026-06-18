import {
  getFirebaseAuth,
  googleProvider,
  signInWithEmailAndPassword,
  signInWithRedirect,
  authErrorMessage,
  redirectAfterAuth,
  showAuthError,
  clearAuthError,
  setButtonLoading,
  setGoogleLoading,
  initAuthPage,
  isFirebaseConfigured,
  ensureAuthPersistence,
} from './firebase-auth.js?v=10';

initAuthPage();

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
    await signInWithRedirect(getFirebaseAuth(), googleProvider);
  } catch (error) {
    showAuthError(authErrorMessage(error.code));
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
    console.error('Email sign-in failed:', error?.code, error?.message);
    showAuthError(authErrorMessage(error.code));
  } finally {
    setButtonLoading(button, false);
  }
});
