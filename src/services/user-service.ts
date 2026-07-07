import { sql } from 'drizzle-orm';
import type { Env, User, RegisterData } from '../types';
import { sanitizeTableName } from '../utils/helpers';
import { NotFoundError, ConflictError } from '../utils/errors';
import { hashPassword } from '../utils/crypto';

/**
 * SELECT clause for the dynamic per-project user table, aliased to
 * the camelCase `User` shape.
 *
 * D1 returns column names exactly as the schema declares them
 * (snake_case), but the rest of the codebase consumes the `User`
 * interface (camelCase). Aliasing in SQL keeps the mapping in one
 * place and avoids the brittle `(row as any).snake_name || row.camelName`
 * shims scattered through callers.
 */
const USER_COLUMNS = `
  id,
  email,
  email_verified AS emailVerified,
  phone,
  phone_verified AS phoneVerified,
  password_hash AS passwordHash,
  oauth_provider AS oauthProvider,
  oauth_provider_user_id AS oauthProviderUserId,
  oauth_raw_user_data AS oauthRawUserData,
  display_name AS displayName,
  avatar_url AS avatarUrl,
  metadata,
  status,
  created_at AS createdAt,
  updated_at AS updatedAt,
  last_login_at AS lastLoginAt
`;

/**
 * User Service - Manages users in per-project tables
 */
export class UserService {
  /**
   * Get user by email from project-specific table
   * @param env - Environment bindings
   * @param tableName - User table name
   * @param email - User email
   * @returns User or null
   */
  async getUserByEmail(
    env: Env,
    tableName: string,
    email: string
  ): Promise<User | null> {
    const safeName = sanitizeTableName(tableName);

    const result = await env.DB.prepare(
      `SELECT ${USER_COLUMNS} FROM ${safeName} WHERE email = ? AND status != 'deleted' LIMIT 1`
    ).bind(email).first();

    return result as User | null;
  }

  /**
   * Get user by ID from project-specific table
   * @param env - Environment bindings
   * @param tableName - User table name
   * @param userId - User ID
   * @returns User or null
   */
  async getUserById(
    env: Env,
    tableName: string,
    userId: string
  ): Promise<User | null> {
    const safeName = sanitizeTableName(tableName);

    const result = await env.DB.prepare(
      `SELECT ${USER_COLUMNS} FROM ${safeName} WHERE id = ? AND status != 'deleted' LIMIT 1`
    ).bind(userId).first();

    return result as User | null;
  }

  /**
   * Get user by OAuth provider info
   * @param env - Environment bindings
   * @param tableName - User table name
   * @param provider - OAuth provider name
   * @param providerUserId - Provider user ID
   * @returns User or null
   */
  async getUserByOAuth(
    env: Env,
    tableName: string,
    provider: string,
    providerUserId: string
  ): Promise<User | null> {
    const safeName = sanitizeTableName(tableName);

    const result = await env.DB.prepare(
      `SELECT ${USER_COLUMNS} FROM ${safeName}
       WHERE oauth_provider = ? AND oauth_provider_user_id = ? AND status != 'deleted'
       LIMIT 1`
    ).bind(provider, providerUserId).first();

    return result as User | null;
  }

  /**
   * Create a new user in project-specific table
   * @param env - Environment bindings
   * @param tableName - User table name
   * @param data - User data
   * @returns Created user
   */
  async createUser(
    env: Env,
    tableName: string,
    data: RegisterData & {
      passwordHash?: string;
      oauthProvider?: string;
      oauthProviderUserId?: string;
      oauthRawUserData?: string;
    }
  ): Promise<User> {
    const safeName = sanitizeTableName(tableName);

    // Check if email already exists (excluding deleted users)
    const existing = await this.getUserByEmail(env, tableName, data.email);
    if (existing) {
      throw new ConflictError('User with this email already exists');
    }

    // Check if there's a deleted user with this email
    const deletedUser = await env.DB.prepare(
      `SELECT 1 FROM ${safeName} WHERE email = ? AND status = 'deleted' LIMIT 1`
    ).bind(data.email).first();

    // If a deleted user exists, reactivate them instead of creating new
    if (deletedUser) {
      console.log(`Reactivating deleted user: ${data.email}`);

      const updates: any = {
        status: 'active',
        displayName: data.displayName,
        emailVerified: false,
        phoneVerified: false,
      };

      if (data.passwordHash) {
        updates.passwordHash = data.passwordHash;
      }
      if (data.oauthProvider) {
        updates.oauthProvider = data.oauthProvider;
        updates.oauthProviderUserId = data.oauthProviderUserId;
        updates.oauthRawUserData = data.oauthRawUserData;
      }

      return await this.updateUser(env, tableName, (deletedUser as any).id, updates);
    }

    // Generate ID
    const id = crypto.randomUUID ? crypto.randomUUID() : this.generateId();

    const params: any[] = [
      id,
      data.email,
      data.passwordHash || null,
      data.oauthProvider || null,
      data.oauthProviderUserId || null,
      data.oauthRawUserData || null,
      data.displayName || null,
    ];

    await env.DB.prepare(`
      INSERT INTO ${safeName} (
        id, email, password_hash, oauth_provider, oauth_provider_user_id,
        oauth_raw_user_data, display_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(...params).run();

    const user = await this.getUserById(env, tableName, id);
    if (!user) {
      throw new Error('Failed to create user');
    }

    return user;
  }

  /**
   * Update user in project-specific table
   * @param env - Environment bindings
   * @param tableName - User table name
   * @param userId - User ID
   * @param updates - Fields to update
   * @returns Updated user
   */
  async updateUser(
    env: Env,
    tableName: string,
    userId: string,
    updates: Partial<User & { passwordHash?: string }>
  ): Promise<User> {
    const safeName = sanitizeTableName(tableName);

    // Build UPDATE query dynamically based on provided fields
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.email !== undefined) {
      // Check if email is already taken by another user
      const existing = await env.DB.prepare(
        `SELECT id FROM ${safeName} WHERE email = ? AND id != ? AND status != 'deleted' LIMIT 1`
      ).bind(updates.email, userId).first();

      if (existing) {
        throw new ConflictError('Email is already taken by another user');
      }

      fields.push('email = ?');
      values.push(updates.email);
    }

    if (updates.passwordHash !== undefined) {
      fields.push('password_hash = ?');
      values.push(updates.passwordHash);
    }

    if (updates.displayName !== undefined) {
      fields.push('display_name = ?');
      values.push(updates.displayName);
    }
    if (updates.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.emailVerified !== undefined) {
      fields.push('email_verified = ?');
      values.push(updates.emailVerified ? 1 : 0);
    }
    if (updates.phoneVerified !== undefined) {
      fields.push('phone_verified = ?');
      values.push(updates.phoneVerified ? 1 : 0);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    await env.DB.prepare(`
      UPDATE ${safeName}
      SET ${fields.join(', ')}
      WHERE id = ?
    `).bind(...values).run();

    const user = await this.getUserById(env, tableName, userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }

  /**
   * Update user's last login time
   * @param env - Environment bindings
   * @param tableName - User table name
   * @param userId - User ID
   */
  async updateLastLogin(
    env: Env,
    tableName: string,
    userId: string
  ): Promise<void> {
    const safeName = sanitizeTableName(tableName);

    await env.DB.prepare(`
      UPDATE ${safeName}
      SET last_login_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(userId).run();
  }

  /**
   * Delete user (soft delete by setting status to 'deleted')
   * @param env - Environment bindings
   * @param tableName - User table name
   * @param userId - User ID
   */
  async deleteUser(
    env: Env,
    tableName: string,
    userId: string
  ): Promise<void> {
    const safeName = sanitizeTableName(tableName);
    const user = await this.getUserById(env, tableName, userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    await env.DB.prepare(
      `UPDATE ${safeName} SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(userId).run();
  }

  /**
   * List users in project table.
   *
   * Pagination and search are applied at the SQL level so `total` (via
   * countUsers) reflects the same filter set.
   *
   * @param env - Environment bindings
   * @param tableName - User table name
   * @param filters - Filter options
   * @returns List of users
   */
  async listUsers(
    env: Env,
    tableName: string,
    filters?: {
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<User[]> {
    const safeName = sanitizeTableName(tableName);
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    let query = `SELECT ${USER_COLUMNS} FROM ${safeName} WHERE status != 'deleted'`;
    const params: any[] = [];

    if (filters?.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }

    if (filters?.search) {
      query += ` AND (email LIKE ? OR display_name LIKE ?)`;
      const term = `%${filters.search}%`;
      params.push(term, term);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = await env.DB.prepare(query).bind(...params).all();
    return result.results as unknown as User[];
  }

  /**
   * Count users in project table.
   *
   * Accepts the same filter set as listUsers so callers can pair them
   * to produce a total that matches the rendered page.
   *
   * @param env - Environment bindings
   * @param tableName - User table name
   * @param status - Optional status filter
   * @param search - Optional search term (matches email OR display_name)
   * @returns User count
   */
  async countUsers(
    env: Env,
    tableName: string,
    status?: string,
    search?: string
  ): Promise<number> {
    const safeName = sanitizeTableName(tableName);

    let query = `SELECT COUNT(*) as count FROM ${safeName} WHERE status != 'deleted'`;
    const params: any[] = [];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (search) {
      query += ` AND (email LIKE ? OR display_name LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term);
    }

    const result = await env.DB.prepare(query).bind(...params).first();
    return (result as any)?.count || 0;
  }

  /**
   * Generate a simple ID (fallback if crypto.randomUUID not available)
   */
  private generateId(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

// Export singleton instance
export const userService = new UserService();