function getAdminHashes() {
  if (Array.isArray(window.__adminEmailHashes) && window.__adminEmailHashes.length) {
    return window.__adminEmailHashes;
  }
  if (window.__adminEmailHash) return [window.__adminEmailHash];
  return [];
}

async function waitForAdminGate(maxMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (getAdminHashes().length) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return getAdminHashes().length > 0;
}

export function collectUserEmails(user) {
  if (!user) return [];
  const emails = new Set();
  if (user.email) emails.add(user.email.trim().toLowerCase());
  for (const provider of user.providerData || []) {
    if (provider.email) emails.add(provider.email.trim().toLowerCase());
  }
  return [...emails];
}

export async function hashEmail(email) {
  if (!email || !globalThis.crypto?.subtle) return '';
  const data = new TextEncoder().encode(email.trim().toLowerCase());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function resolveUserEmails(user, { retry = true } = {}) {
  let emails = collectUserEmails(user);
  if (emails.length || !retry || !user?.reload) return emails;

  try {
    await user.reload();
    emails = collectUserEmails(user);
  } catch {
    /* profile may load before Google has attached email */
  }
  return emails;
}

export async function isAdminUser(user, options = {}) {
  const { retry = true } = options;
  if (!user) return false;

  await waitForAdminGate();
  const hashes = getAdminHashes();
  if (!hashes.length) return false;

  const emails = await resolveUserEmails(user, { retry });
  if (!emails.length) return false;

  try {
    for (const email of emails) {
      const digest = await hashEmail(email);
      if (digest && hashes.includes(digest)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
