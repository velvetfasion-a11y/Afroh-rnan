// Auto-generated from .env — do not edit manually.
// Run: node scripts/generate-firebase-config.mjs
(function () {
  var hostname = window.location.hostname;
  var isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
  function clearEmulatorDefaults() {
    try {
      document.cookie = '__FIREBASE_DEFAULTS__=; Max-Age=0; path=/';
      document.cookie = '__FIREBASE_DEFAULTS__=; Max-Age=0; path=/; domain=' + hostname;
      if (hostname.indexOf('.') !== -1) {
        document.cookie = '__FIREBASE_DEFAULTS__=; Max-Age=0; path=/; domain=.' + hostname.replace(/^www\./, '');
      }
    } catch (_) {}
    try { delete window.__FIREBASE_DEFAULTS__; } catch (_) { window.__FIREBASE_DEFAULTS__ = undefined; }
  }
  if (!isLocalDev) clearEmulatorDefaults();
  window.AfroSite = {
    isLocalDev: isLocalDev,
    hostname: hostname,
    origin: window.location.origin,
    checkoutApiUrl: isLocalDev ? null : 'https://europe-west1-afrohornan.cloudfunctions.net/createPaymentIntent',
    useFirebaseEmulators: false,
    clearEmulatorDefaults: clearEmulatorDefaults,
  };
})();
window.firebaseConfig = {
  "apiKey": "AIzaSyBAoXVBcjLu9ug-u0XFTzQwpLJCW7uUYBs",
  "authDomain": "afrohornan.firebaseapp.com",
  "projectId": "afrohornan",
  "storageBucket": "afrohornan.firebasestorage.app",
  "messagingSenderId": "574403442477",
  "appId": "1:574403442477:web:291f666319685b661bc5a4",
  "measurementId": "G-143J6Q77KT"
};
