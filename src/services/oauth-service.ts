import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { projectOAuthProviders } from '../db/schema';
import type { Env, OAuthProvider, CreateOAuthProviderData } from '../types';
import { projectService } from './project-service';
import { userService } from './user-service';
import { jwtService } from './jwt-service';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { encrypt, decrypt } from '../utils/crypto';

/**
 * OAuth Service - Handles OAuth provider configuration and flows
 */
export class OAuthService {
  /**
   * Configure an OAuth provider for a project
   * @param env - Environment bindings
   * @param data - OAuth provider data
   * @returns Created provider
   */
  async configureProvider(
    env: Env,
    data: CreateOAuthProviderData
  ): Promise<OAuthProvider> {
    const db = drizzle(env.DB);

    // Verify project exists
    const project = await projectService.getProject(env, data.projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Encrypt client secret if encryption key available
    let clientSecret = data.clientSecret;
    if (env.ENCRYPTION_KEY) {
      clientSecret = await encrypt(data.clientSecret, env.ENCRYPTION_KEY);
    }

    // Check if provider already exists
    const existing = await db
      .select()
      .from(projectOAuthProviders)
      .where(
        and(
          eq(projectOAuthProviders.projectId, data.projectId),
          eq(projectOAuthProviders.providerName, data.providerName)
        )
      )
      .get();

    if (existing) {
      // Update existing provider
      const updated = await db
        .update(projectOAuthProviders)
        .set({
          enabled: data.enabled !== undefined ? data.enabled : true,
          clientId: data.clientId,
          clientSecret,
          authorizationUrl: data.authorizationUrl || null,
          tokenUrl: data.tokenUrl || null,
          userInfoUrl: data.userInfoUrl || null,
          scopes: data.scopes ? JSON.stringify(data.scopes) : null,
          additionalConfig: data.additionalConfig ? JSON.stringify(data.additionalConfig) : null,
        })
        .where(eq(projectOAuthProviders.id, existing.id))
        .returning()
        .get();

      return updated as unknown as OAuthProvider;
    }

    // Create new provider
    const created = await db
      .insert(projectOAuthProviders)
      .values({
        projectId: data.projectId,
        providerName: data.providerName,
        enabled: data.enabled !== undefined ? data.enabled : true,
        clientId: data.clientId,
        clientSecret,
        authorizationUrl: data.authorizationUrl || this.getDefaultAuthUrl(data.providerName),
        tokenUrl: data.tokenUrl || this.getDefaultTokenUrl(data.providerName),
        userInfoUrl: data.userInfoUrl || this.getDefaultUserInfoUrl(data.providerName),
        scopes: data.scopes ? JSON.stringify(data.scopes) : JSON.stringify(this.getDefaultScopes(data.providerName)),
        additionalConfig: data.additionalConfig ? JSON.stringify(data.additionalConfig) : null,
      })
      .returning()
      .get();

    return created as unknown as OAuthProvider;
  }

  /**
   * Get OAuth authorization URL
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param providerName - Provider name
   * @param redirectUri - Redirect URI
   * @param state - State parameter for CSRF protection
   * @returns Authorization URL
   */
  async getAuthUrl(
    env: Env,
    projectId: string,
    providerName: string,
    redirectUri: string,
    state: string
  ): Promise<string> {
    const provider = await this.getProvider(env, projectId, providerName);
    if (!provider.enabled) {
      throw new BadRequestError('OAuth provider is disabled');
    }

    const scopes = provider.scopes ? JSON.parse(provider.scopes) : this.getDefaultScopes(providerName);
    const scopeString = Array.isArray(scopes) ? scopes.join(' ') : scopes;

    const params = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopeString,
      state,
    });

    return `${provider.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Handle OAuth callback and create/login user
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param providerName - Provider name
   * @param code - Authorization code
   * @param redirectUri - Redirect URI
   * @returns User and tokens
   */
  async handleCallback(
    env: Env,
    projectId: string,
    providerName: string,
    code: string,
    redirectUri: string
  ): Promise<{ user: any; accessToken: string; refreshToken: string }> {
    const provider = await this.getProvider(env, projectId, providerName);
    const project = await projectService.getProject(env, projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Decrypt client secret if encrypted
    let clientSecret = provider.clientSecret;
    if (env.ENCRYPTION_KEY && clientSecret) {
      try {
        clientSecret = await decrypt(clientSecret, env.ENCRYPTION_KEY);
      } catch {
        // If decryption fails, assume it wasn't encrypted
      }
    }

    // Exchange code for token
    const tokenResponse = await fetch(provider.tokenUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: provider.clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestError('Failed to exchange authorization code');
    }

    const tokenData = await tokenResponse.json() as any;
    const accessToken = tokenData.access_token;

    // Get user info from provider
    const userInfoResponse = await fetch(provider.userInfoUrl!, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoResponse.ok) {
      throw new BadRequestError('Failed to fetch user info');
    }

    const userInfo = await userInfoResponse.json() as any;

    // Extract email and other info based on provider
    const email = this.extractEmail(userInfo, providerName);
    const displayName = this.extractDisplayName(userInfo, providerName);
    const providerId = this.extractProviderId(userInfo, providerName);

    if (!email) {
      throw new BadRequestError('Could not extract email from OAuth provider');
    }

    // Check if user exists with this OAuth identity
    let user = await userService.getUserByOAuth(env, project.userTableName, providerName, providerId);

    if (!user) {
      // Check if user exists with this email
      user = await userService.getUserByEmail(env, project.userTableName, email);

      if (user) {
        // Link OAuth to existing user (simplified - would need more logic in production)
        // For now, just return error
        throw new BadRequestError('Email already registered. Please login with password first.');
      }

      // Create new user
      user = await userService.createUser(env, project.userTableName, {
        email,
        password: '', // No password for OAuth users
        displayName,
        oauthProvider: providerName,
        oauthProviderUserId: providerId,
        oauthRawUserData: JSON.stringify(userInfo),
      });
    }

    // Generate JWT tokens
    const jwtAccessToken = await jwtService.generateAccessToken(project, user.id, user.email);
    // Would need to import authService to create refresh token properly
    // For now, return a placeholder
    const refreshToken = 'refresh_token_placeholder';

    return { user, accessToken: jwtAccessToken, refreshToken };
  }

  /**
   * Get OAuth provider configuration
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param providerName - Provider name
   * @returns Provider configuration
   */
  private async getProvider(
    env: Env,
    projectId: string,
    providerName: string
  ): Promise<OAuthProvider> {
    const db = drizzle(env.DB);

    const provider = await db
      .select()
      .from(projectOAuthProviders)
      .where(
        and(
          eq(projectOAuthProviders.projectId, projectId),
          eq(projectOAuthProviders.providerName, providerName as any)
        )
      )
      .get();

    if (!provider) {
      throw new NotFoundError('OAuth provider not configured');
    }

    return provider as unknown as OAuthProvider;
  }

  /**
   * List all OAuth providers for a project
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @returns List of OAuth providers
   */
  async listProviders(env: Env, projectId: string): Promise<OAuthProvider[]> {
    const db = drizzle(env.DB);

    const providers = await db
      .select()
      .from(projectOAuthProviders)
      .where(eq(projectOAuthProviders.projectId, projectId))
      .all();

    return providers as unknown as OAuthProvider[];
  }

  /**
   * Update OAuth provider
   * @param env - Environment bindings
   * @param providerId - Provider ID
   * @param data - Update data
   * @returns Updated provider
   */
  async updateProvider(
    env: Env,
    providerId: string,
    data: Partial<OAuthProvider>
  ): Promise<OAuthProvider> {
    const db = drizzle(env.DB);

    // Encrypt client secret if provided and encryption key available
    if (data.clientSecret && env.ENCRYPTION_KEY) {
      data.clientSecret = await encrypt(data.clientSecret, env.ENCRYPTION_KEY);
    }

    const updated = await db
      .update(projectOAuthProviders)
      .set(data as any)
      .where(eq(projectOAuthProviders.id, providerId))
      .returning()
      .get();

    if (!updated) {
      throw new NotFoundError('OAuth provider not found');
    }

    return updated as unknown as OAuthProvider;
  }

  /**
   * Delete OAuth provider
   * @param env - Environment bindings
   * @param providerId - Provider ID
   */
  async deleteProvider(env: Env, providerId: string): Promise<void> {
    const db = drizzle(env.DB);

    await db
      .delete(projectOAuthProviders)
      .where(eq(projectOAuthProviders.id, providerId));
  }

  /**
   * Get default authorization URL for provider
   */
  private getDefaultAuthUrl(provider: string): string {
    const urls: Record<string, string> = {
      google: 'https://accounts.google.com/o/oauth2/v2/auth',
      github: 'https://github.com/login/oauth/authorize',
      microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    };
    return urls[provider] || '';
  }

  /**
   * Get default token URL for provider
   */
  private getDefaultTokenUrl(provider: string): string {
    const urls: Record<string, string> = {
      google: 'https://oauth2.googleapis.com/token',
      github: 'https://github.com/login/oauth/access_token',
      microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    };
    return urls[provider] || '';
  }

  /**
   * Get default user info URL for provider
   */
  private getDefaultUserInfoUrl(provider: string): string {
    const urls: Record<string, string> = {
      google: 'https://www.googleapis.com/oauth2/v2/userinfo',
      github: 'https://api.github.com/user',
      microsoft: 'https://graph.microsoft.com/v1.0/me',
    };
    return urls[provider] || '';
  }

  /**
   * Get default scopes for provider
   */
  private getDefaultScopes(provider: string): string[] {
    const scopes: Record<string, string[]> = {
      google: ['email', 'profile', 'openid'],
      github: ['user:email'],
      microsoft: ['openid', 'profile', 'email'],
    };
    return scopes[provider] || ['email'];
  }

  /**
   * Extract email from provider user info
   */
  private extractEmail(userInfo: any, provider: string): string {
    return userInfo.email || userInfo.mail || '';
  }

  /**
   * Extract display name from provider user info
   */
  private extractDisplayName(userInfo: any, provider: string): string {
    return userInfo.name || userInfo.displayName || userInfo.login || '';
  }

  /**
   * Extract provider user ID
   */
  private extractProviderId(userInfo: any, provider: string): string {
    return userInfo.id || userInfo.sub || userInfo.oid || '';
  }
}

// Export singleton instance
export const oauthService = new OAuthService();