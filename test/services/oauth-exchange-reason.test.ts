import { afterEach, describe, expect, it, vi } from 'vitest';
import { oauthService } from '../../src/services/oauth-service';
import { projectService } from '../../src/services/project-service';

// A failed code exchange must say which OAuth error the provider returned: invalid_client (wrong secret) and
// invalid_grant (expired or reused code) need different fixes, and the generic message hid the difference.
describe('OAuth code exchange failure', () => {
  afterEach(() => vi.restoreAllMocks());

  function setUp(response: Response) {
    vi.spyOn(oauthService as any, 'getProvider').mockResolvedValue({
      enabled: true, clientId: 'client', clientSecret: 'plain-secret', tokenUrl: 'https://oauth2.example/token',
      userInfoUrl: 'https://oauth2.example/userinfo',
    });
    vi.spyOn(projectService, 'getProject').mockResolvedValue({ id: 'p', redirectUrls: ['https://app/cb'] } as any);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    return vi.spyOn(console, 'error').mockImplementation(() => {});
  }

  it('names the provider error and logs it without the secret', async () => {
    const log = setUp(new Response(JSON.stringify({ error: 'invalid_client', error_description: 'Unauthorized' }), { status: 401 }));
    await expect(oauthService.handleCallback({} as any, 'p', 'google', 'code', 'https://app/cb', 'verifier'))
      .rejects.toThrow('Failed to exchange authorization code (invalid_client)');
    const line = String(log.mock.calls[0][0]);
    expect(JSON.parse(line)).toMatchObject({ event: 'oauth_code_exchange_failed', provider: 'google', reason: 'invalid_client' });
    expect(line).not.toContain('plain-secret');
    expect(line).not.toContain('verifier');
  });

  it('falls back to the HTTP status when the body has no usable error', async () => {
    setUp(new Response('<html>oops</html>', { status: 502 }));
    await expect(oauthService.handleCallback({} as any, 'p', 'google', 'code', 'https://app/cb', 'verifier'))
      .rejects.toThrow('Failed to exchange authorization code (http_502)');
  });
});
