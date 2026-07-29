function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

export function generateOAuthState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function generatePkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = generateOAuthState();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return { codeVerifier, codeChallenge: base64url(new Uint8Array(digest)) };
}

export function isAllowedRedirectUri(redirectUri: string, redirectUrls: string | null): boolean {
  if (!redirectUri || !redirectUrls) return false;
  try {
    const allowed = JSON.parse(redirectUrls);
    return Array.isArray(allowed) && allowed.includes(redirectUri);
  } catch {
    return false;
  }
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64url(new Uint8Array(signature));
}

export async function createBootstrapToken(secret: string, issuedAt = Math.floor(Date.now() / 1000)): Promise<string> {
  const payload = `bootstrap.${issuedAt}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyBootstrapToken(token: string, secret: string, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const [purpose, issuedAtText, signature, ...extra] = token.split('.');
  if (extra.length || purpose !== 'bootstrap' || !/^\d+$/.test(issuedAtText || '') || !signature) return false;
  const issuedAt = Number(issuedAtText);
  if (issuedAt > now || now - issuedAt > 600) return false;
  return timingSafeEqual(signature, await hmac(secret, `${purpose}.${issuedAtText}`));
}
