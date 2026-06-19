import { getFirebaseAuth, onAuthStateChanged, isFirebaseConfigured } from './firebase-auth.js?v=20';

function fillField(id, value) {
  const el = document.getElementById(id);
  if (!el || el.value.trim()) return;
  if (value) el.value = value;
}

function prefillCheckout(user) {
  if (!user) return;

  fillField('checkout-email', user.email || '');
  fillField('pickup-email', user.email || '');
  fillField('checkout-name', user.displayName || '');
  fillField('checkout-phone', user.phoneNumber || '');
}

if (isFirebaseConfigured()) {
  const auth = getFirebaseAuth();
  onAuthStateChanged(auth, prefillCheckout);
  if (auth.currentUser) prefillCheckout(auth.currentUser);

  window.AfroCheckoutAuth = {
    async getIdToken() {
      const user = getFirebaseAuth().currentUser;
      if (!user) return null;
      return user.getIdToken();
    },
    getUid() {
      return getFirebaseAuth().currentUser?.uid || null;
    },
  };
}
