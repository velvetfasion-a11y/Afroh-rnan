import {
  getFirebaseAuth,
  createUserWithEmailAndPassword,
  signInWithGoogle,
  updateProfile,
  formatAuthError,
  logAuthError,
  redirectAfterAuth,
  showAuthError,
  showAuthSuccess,
  clearAuthError,
  setButtonLoading,
  setGoogleLoading,
  initAuthPage,
  isFirebaseConfigured,
  ensureAuthReady,
  isGoogleRedirectPending,
} from './firebase-auth.js?v=20';

const googleBtn = document.getElementById('googleSignup');

initAuthPage({ googleButtonId: 'googleSignup' });

googleBtn?.addEventListener('click', () => {
  clearAuthError();

  if (!isFirebaseConfigured()) {
    showAuthError('Firebase är inte konfigurerat ännu. Kör node scripts/generate-firebase-config.mjs');
    return;
  }

  setGoogleLoading(googleBtn, true);

  signInWithGoogle()
    .then(async (user) => {
      if (user) {
        showAuthSuccess('Konto skapat! Omdirigerar…');
        setGoogleLoading(googleBtn, true);
        await redirectAfterAuth(user);
      }
    })
    .catch((error) => {
      logAuthError('Google sign-up click', error);
      const message = formatAuthError(error);
      if (message) showAuthError(message);
    })
    .finally(() => {
      if (!isGoogleRedirectPending()) {
        setGoogleLoading(googleBtn, false);
      }
    });
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
    await ensureAuthReady();
    const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    if (name) {
      await updateProfile(credential.user, { displayName: name });
    }
    showAuthSuccess('Konto skapat! Omdirigerar…');
    await redirectAfterAuth(credential.user);
  } catch (error) {
    logAuthError('Email sign-up', error);
    const message = formatAuthError(error);
    if (message) showAuthError(message);
  } finally {
    setButtonLoading(button, false);
  }
});
