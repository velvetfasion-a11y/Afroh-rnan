import { requireAdmin, signOut, getFirebaseAuth } from './firebase-auth.js';

requireAdmin((user) => {
  document.getElementById('adminLoading').hidden = true;
  document.getElementById('adminContent').hidden = false;
  document.getElementById('adminEmail').textContent = user.email || '';
});

document.getElementById('adminLogout').addEventListener('click', async () => {
  await signOut(getFirebaseAuth());
  window.location.href = 'index.html';
});
