export async function hashEmail(email) {
  const data = new TextEncoder().encode(email.trim().toLowerCase());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function isAdminUser(user) {
  if (!user?.email || !window.__adminEmailHash) return false;
  return (await hashEmail(user.email)) === window.__adminEmailHash;
}
