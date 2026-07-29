import { describe, expect, it } from 'vitest';
import {
  createBootstrapToken,
  generateOAuthState,
  generatePkcePair,
  isAllowedRedirectUri,
  verifyBootstrapToken,
} from '../../src/utils/oauth-security';

describe('OAuth security helpers', () => {
  it('creates a 32-byte base64url OAuth state value', () => {
    const state = generateOAuthState();
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('creates an S256 PKCE challenge for the verifier', async () => {
    const { codeChallenge, codeVerifier } = await generatePkcePair();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).not.toBe(codeVerifier);
  });

  it('only accepts exact configured redirect URIs', () => {
    expect(isAllowedRedirectUri('https://app.example.com/callback', '["https://app.example.com/callback"]')).toBe(true);
    expect(isAllowedRedirectUri('https://app.example.com.evil.invalid/callback', '["https://app.example.com/callback"]')).toBe(false);
  });

  it('signs expiring bootstrap tokens and rejects tampering', async () => {
    const token = await createBootstrapToken('bootstrap-secret', 1234);
    await expect(verifyBootstrapToken(token, 'bootstrap-secret', 1234)).resolves.toBe(true);
    await expect(verifyBootstrapToken(`${token}x`, 'bootstrap-secret', 1234)).resolves.toBe(false);
    await expect(verifyBootstrapToken(token, 'wrong-secret', 1234)).resolves.toBe(false);
  });
});
