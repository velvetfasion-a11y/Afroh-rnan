import {
  signInWithEmailPassword,
  signInWithGoogle,
  sendPasswordReset,
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
  isGoogleRedirectPending,
} from './firebase-auth.js?v=20';

const forgotWrap = document.getElementById('forgotPasswordWrap');
const forgotBtn = document.getElementById('forgotPasswordBtn');
const googleBtn = document.getElementById('googleLogin');

function showForgotPassword() {
  forgotWrap?.removeAttribute('hidden');
}

initAuthPage();

// Synkront klick → popup startar direkt (krävs för iOS Safari).
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
        showAuthSuccess('Inloggad! Omdirigerar…');
        setGoogleLoading(googleBtn, true);
        await redirectAfterAuth(user);
      }
    })
    .catch((error) => {
      logAuthError('Google sign-in click', error);
      const message = formatAuthError(error);
      if (message) showAuthError(message);
    })
    .finally(() => {
      if (!isGoogleRedirectPending()) {
        setGoogleLoading(googleBtn, false);
      }
    });
});

forgotBtn?.addEventListener('click', async () => {
  clearAuthError();
  const email = document.getElementById('email').value.trim();
  if (!email) {
    showAuthError('Ange din e-postadress ovan först.');
    document.getElementById('email').focus();
    return;
  }

  forgotBtn.disabled = true;
  try {
    await sendPasswordReset(email);
    showAuthSuccess('Vi har skickat en länk för att återställa lösenordet om kontot finns.');
  } catch (error) {
    logAuthError('Password reset', error);
    const message = formatAuthError(error);
    if (message) showAuthError(message);
  } finally {
    forgotBtn.disabled = false;
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
    const result = await signInWithEmailPassword(email, password);
    showAuthSuccess('Inloggad! Omdirigerar…');
    await redirectAfterAuth(result.user);
  } catch (error) {
    logAuthError('Email sign-in', error);
    const message = formatAuthError(error);
    if (message) showAuthError(message);
    showForgotPassword();
  } finally {
    setButtonLoading(button, false);
  }
});
