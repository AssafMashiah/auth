import * as jose from 'jose';
import type { JWTPayload, Project } from '../types';
import { AuthenticationError } from '../utils/errors';

/**
 * JWT Service - Handles JWT token generation and verification
 */
export class JWTService {
  /**
   * Generate an access token for a user
   * @param project - Project configuration
   * @param userId - User ID
   * @param email - User email
   * @returns JWT access token
   */
  async generateAccessToken(
    project: Project,
    userId: string,
    email: string
  ): Promise<string> {
    const secret = new TextEncoder().encode(project.jwtSecret);

    // Use jose builder pattern for proper JWT generation
    const jwt = await new jose.SignJWT({
      sub: userId,
      email,
      projectId: project.id,
    })
      .setProtectedHeader({ alg: project.jwtAlgorithm || 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${project.jwtExpirySeconds}s`) // Use string format for relative time
      .sign(secret);

    return jwt;
  }

  /**
   * Verify and decode an access token
   * @param token - JWT token
   * @param jwtSecret - JWT secret for verification
   * @param algorithm - JWT algorithm
   * @returns Decoded payload
   */
  async verifyAccessToken(
    token: string,
    jwtSecret: string,
    algorithm: string = 'HS256'
  ): Promise<JWTPayload> {
    try {
      const secret = new TextEncoder().encode(jwtSecret);

      const { payload } = await jose.jwtVerify(token, secret, {
        algorithms: [algorithm as jose.JWTHeaderParameters['alg']],
      });

      return {
        sub: payload.sub as string,
        email: payload.email as string,
        projectId: payload.projectId as string,
        iat: payload.iat as number,
        exp: payload.exp as number,
      };
    } catch (error) {
      throw new AuthenticationError('Invalid or expired token');
    }
  }

  /**
   * Decode a JWT without verification (for inspection)
   * @param token - JWT token
   * @returns Decoded payload
   */
  decodeToken(token: string): JWTPayload | null {
    try {
      const decoded = jose.decodeJwt(token);
      return decoded as unknown as JWTPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check if a token is expired
   * @param token - JWT token
   * @returns True if expired
   */
  isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) return true;
    return decoded.exp < Math.floor(Date.now() / 1000);
  }

  /**
   * Get token expiration time
   * @param token - JWT token
   * @returns Expiration timestamp or null
   */
  getTokenExpiration(token: string): number | null {
    const decoded = this.decodeToken(token);
    return decoded?.exp || null;
  }

  /**
   * Extract token from Authorization header
   * @param authHeader - Authorization header value
   * @returns Token or null
   */
  extractTokenFromHeader(authHeader: string | null): string | null {
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }
}

// Export singleton instance
export const jwtService = new JWTService();