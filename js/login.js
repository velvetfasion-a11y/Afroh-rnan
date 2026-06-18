import {
  signInWithEmailPassword,
  signInWithGoogle,
  sendPasswordReset,
  authErrorMessage,
  redirectAfterAuth,
  showAuthError,
  showAuthSuccess,
  clearAuthError,
  setButtonLoading,
  setGoogleLoading,
  initAuthPage,
  isFirebaseConfigured,
} from './firebase-auth.js?v=14';

const forgotWrap = document.getElementById('forgotPasswordWrap');
const forgotBtn = document.getElementById('forgotPasswordBtn');

function showForgotPassword() {
  forgotWrap?.removeAttribute('hidden');
}

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
    const user = await signInWithGoogle();
    if (user) await redirectAfterAuth(user);
  } catch (error) {
    console.error('Google sign-in failed:', error?.code, error?.message);
    showAuthError(authErrorMessage(error?.code));
  } finally {
    setGoogleLoading(button, false);
  }
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
    console.error('Password reset failed:', error?.code, error?.message);
    showAuthError(authErrorMessage(error?.code));
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
    await redirectAfterAuth(result.user);
  } catch (error) {
    console.error('Email sign-in failed:', error?.code, error?.message);
    showAuthError(authErrorMessage(error?.code));
    showForgotPassword();
  } finally {
    setButtonLoading(button, false);
  }
});
