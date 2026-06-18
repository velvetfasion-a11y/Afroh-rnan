import {
  getFirebaseAuth,
  googleProvider,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  authErrorMessage,
  redirectAfterAuth,
  showAuthError,
  clearAuthError,
  setButtonLoading,
  setGoogleLoading,
  guardAuthPage,
  isFirebaseConfigured,
  ensureAuthPersistence,
} from './firebase-auth.js?v=5';

guardAuthPage();

document.getElementById('googleSignup').addEventListener('click', async () => {
  clearAuthError();
  const button = document.getElementById('googleSignup');
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

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthError();

  if (!isFirebaseConfigured()) {
    showAuthError('Firebase är inte konfigurerat ännu. Kör node scripts/generate-firebase-config.mjs');
    return;
  }

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const button = e.target.querySelector('.auth-submit');

  setButtonLoading(button, true, 'Skapar konto…');
  try {
    await ensureAuthPersistence();
    const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    if (name) {
      await updateProfile(credential.user, { displayName: name });
    }
    await redirectAfterAuth(credential.user);
  } catch (error) {
    showAuthError(authErrorMessage(error.code));
  } finally {
    setButtonLoading(button, false);
  }
});
