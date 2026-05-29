import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Env, User } from '../types';
import { userService } from './user-service';
import { auditService } from './audit-service';
import { sanitizeTableName } from '../utils/helpers';

/**
 * Supabase user type (from auth.users table)
 */
interface SupabaseUser {
  id: string;
  email: string;
  encrypted_password?: string; // bcrypt hash
  email_confirmed_at: string | null;
  phone: string | null;
  phone_confirmed_at: string | null;
  raw_user_meta_data: Record<string, any> | null;
  raw_app_meta_data: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  // OAuth identities
  identities?: Array<{
    provider: string;
    id: string;
    user_id: string;
    identity_data: Record<string, any>;
  }>;
}

/**
 * Import options
 */
export interface ImportOptions {
  batchSize?: number;
  skipExisting?: boolean;
  preserveIds?: boolean;
  importMetadata?: boolean;
  preserveOAuth?: boolean;
}

/**
 * Import result
 */
export interface ImportResult {
  totalUsers: number;
  imported: number;
  failed: number;
  skipped: number;
  errors: Array<{
    email: string;
    reason: string;
  }>;
}

/**
 * Import progress callback
 */
export type ProgressCallback = (progress: {
  current: number;
  total: number;
  batch: number;
  totalBatches: number;
  status: string;
}) => void;

/**
 * Supabase Import Service - Handles user migration from Supabase
 */
export class SupabaseImportService {
  /**
   * Validate Supabase credentials by attempting a connection
   */
  async validateSupabaseCredentials(
    supabaseUrl: string,
    supabaseServiceKey: string
  ): Promise<{ valid: boolean; userCount?: number; error?: string }> {
    try {
      // Create Supabase admin client
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      // Test connection by fetching users
      const { data, error } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1,
      });

      if (error) {
        return {
          valid: false,
          error: error.message || 'Failed to connect to Supabase',
        };
      }

      // Supabase doesn't return total count directly, we'll need to fetch all pages
      // For validation, we just confirm we can connect
      return {
        valid: true,
        userCount: undefined, // Will be calculated during actual import
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Invalid credentials',
      };
    }
  }

  /**
   * Fetch users from Supabase with pagination
   */
  async fetchSupabaseUsers(
    supabaseUrl: string,
    supabaseServiceKey: string,
    page: number = 1,
    perPage: number = 100
  ): Promise<SupabaseUser[]> {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }

    return (data.users || []) as unknown as SupabaseUser[];
  }

  /**
   * Map Supabase user to local user format
   */
  mapSupabaseUserToLocal(
    supabaseUser: SupabaseUser,
    options: ImportOptions
  ): {
    id?: string;
    email: string;
    passwordHash: string | null;
    emailVerified: boolean;
    phone: string | null;
    phoneVerified: boolean;
    displayName: string | null;
    avatarUrl: string | null;
    metadata: string | null;
    oauthProvider: string | null;
    oauthProviderUserId: string | null;
    oauthRawUserData: string | null;
  } {
    // NOTE: Supabase Admin API does NOT expose encrypted_password for security reasons
    // Users will need to reset their passwords after migration
    const user: any = {
      email: supabaseUser.email || null,
      passwordHash: null, // Cannot be migrated via Supabase API
      emailVerified: !!supabaseUser.email_confirmed_at,
      phone: supabaseUser.phone?.trim() || null, // Convert empty strings and undefined to null
      phoneVerified: !!supabaseUser.phone_confirmed_at,
      displayName: null,
      avatarUrl: null,
      metadata: null,
      oauthProvider: null,
      oauthProviderUserId: null,
      oauthRawUserData: null,
    };

    // Preserve user ID if requested
    if (options.preserveIds) {
      user.id = supabaseUser.id || null;
    }

    // Extract display name from metadata
    if (supabaseUser.raw_user_meta_data) {
      user.displayName =
        supabaseUser.raw_user_meta_data.full_name ||
        supabaseUser.raw_user_meta_data.name ||
        supabaseUser.raw_user_meta_data.display_name ||
        null;

      user.avatarUrl =
        supabaseUser.raw_user_meta_data.avatar_url ||
        supabaseUser.raw_user_meta_data.picture ||
        null;
    }

    // Import metadata if requested
    if (options.importMetadata) {
      const metadata: any = {};
      if (supabaseUser.raw_user_meta_data) {
        metadata.user_metadata = supabaseUser.raw_user_meta_data;
      }
      if (supabaseUser.raw_app_meta_data) {
        metadata.app_metadata = supabaseUser.raw_app_meta_data;
      }
      if (Object.keys(metadata).length > 0) {
        user.metadata = JSON.stringify(metadata);
      }
    }

    // Handle OAuth identities
    if (options.preserveOAuth && supabaseUser.identities && supabaseUser.identities.length > 0) {
      const primaryIdentity = supabaseUser.identities[0];
      user.oauthProvider = primaryIdentity.provider || null;
      user.oauthProviderUserId = primaryIdentity.id || null;
      user.oauthRawUserData = JSON.stringify(primaryIdentity.identity_data || {});
    }

    return user;
  }

  /**
   * Import users from Supabase to local project
   */
  async importUsers(
    env: Env,
    projectId: string,
    userTableName: string,
    supabaseUrl: string,
    supabaseServiceKey: string,
    options: ImportOptions = {},
    onProgress?: ProgressCallback
  ): Promise<ImportResult> {
    const batchSize = options.batchSize || 100;
    const result: ImportResult = {
      totalUsers: 0,
      imported: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    try {
      // Validate credentials first
      const validation = await this.validateSupabaseCredentials(
        supabaseUrl,
        supabaseServiceKey
      );

      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid Supabase credentials');
      }

      // Fetch all users to get actual count
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      let allUsers: SupabaseUser[] = [];
      let page = 1;

      // Fetch all users
      while (true) {
        const { data, error } = await supabase.auth.admin.listUsers({
          page,
          perPage: batchSize,
        });

        if (error) {
          throw new Error(`Failed to fetch users: ${error.message}`);
        }

        const users = (data.users || []) as unknown as SupabaseUser[];
        if (users.length === 0) break;

        allUsers.push(...users);

        if (users.length < batchSize) break;
        page++;
      }

      result.totalUsers = allUsers.length;

      if (result.totalUsers === 0) {
        return result;
      }

      // Calculate total batches
      const totalBatches = Math.ceil(result.totalUsers / batchSize);

      // Log import start using admin_action type
      await auditService.logEvent(env, {
        projectId,
        eventType: 'admin_action',
        eventStatus: 'success',
        eventData: {
          action: 'supabase_import_started',
          totalUsers: result.totalUsers,
          options,
        },
      });

      // Process users in batches
      for (let batch = 0; batch < totalBatches; batch++) {
        try {
          // Get batch from allUsers array
          const start = batch * batchSize;
          const end = Math.min(start + batchSize, allUsers.length);
          const supabaseUsers = allUsers.slice(start, end);

          // Update progress
          if (onProgress) {
            onProgress({
              current: end,
              total: result.totalUsers,
              batch: batch + 1,
              totalBatches,
              status: `Importing batch ${batch + 1} of ${totalBatches}...`,
            });
          }

          // Import each user in the batch
          for (const supabaseUser of supabaseUsers) {
            try {
              // Skip if user exists and skipExisting is true
              if (options.skipExisting) {
                const existing = await userService.getUserByEmail(
                  env,
                  userTableName,
                  supabaseUser.email
                );
                if (existing) {
                  result.skipped++;
                  continue;
                }
              }

              // Map Supabase user to local format
              const userData = this.mapSupabaseUserToLocal(supabaseUser, options);

              // Insert user directly to preserve password hash
              const safeName = sanitizeTableName(userTableName);
              const id = userData.id || crypto.randomUUID();

              // Ensure all values are either defined or null to prevent D1 type errors
              const lastSignInAt = supabaseUser.last_sign_in_at ?? null;

              await env.DB.prepare(`
                INSERT INTO ${safeName} (
                  id, email, email_verified, phone, phone_verified,
                  password_hash, oauth_provider, oauth_provider_user_id,
                  oauth_raw_user_data, display_name, avatar_url, metadata,
                  created_at, updated_at, last_login_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(
                id,
                userData.email,
                userData.emailVerified ? 1 : 0,
                userData.phone,
                userData.phoneVerified ? 1 : 0,
                userData.passwordHash,
                userData.oauthProvider,
                userData.oauthProviderUserId,
                userData.oauthRawUserData,
                userData.displayName,
                userData.avatarUrl,
                userData.metadata,
                supabaseUser.created_at,
                supabaseUser.updated_at,
                lastSignInAt
              ).run();

              result.imported++;
            } catch (error: any) {
              result.failed++;
              result.errors.push({
                email: supabaseUser.email,
                reason: error.message || 'Unknown error',
              });
            }
          }
        } catch (error: any) {
          // Batch failed, log and continue
          await auditService.logEvent(env, {
            projectId,
            eventType: 'admin_action',
            eventStatus: 'failure',
            eventData: {
              action: 'supabase_import_batch_failed',
              batch,
              error: error.message,
            },
          });
        }
      }

      // Log import completion
      await auditService.logEvent(env, {
        projectId,
        eventType: 'admin_action',
        eventStatus: 'success',
        eventData: {
          action: 'supabase_import_completed',
          imported: result.imported,
          failed: result.failed,
          skipped: result.skipped,
        },
      });

      return result;
    } catch (error: any) {
      // Log import failure
      await auditService.logEvent(env, {
        projectId,
        eventType: 'admin_action',
        eventStatus: 'failure',
        eventData: {
          action: 'supabase_import_failed',
          error: error.message,
        },
      });

      throw error;
    }
  }

  /**
   * Get preview of users to be imported
   */
  async getImportPreview(
    supabaseUrl: string,
    supabaseServiceKey: string,
    limit: number = 5
  ): Promise<{
    totalCount: number;
    sampleUsers: Array<{
      email: string;
      displayName: string | null;
      hasPassword: boolean;
      hasOAuth: boolean;
      createdAt: string;
    }>;
  }> {
    const validation = await this.validateSupabaseCredentials(
      supabaseUrl,
      supabaseServiceKey
    );

    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid credentials');
    }

    // Fetch all users to get actual count (Supabase doesn't provide total count)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    let totalCount = 0;
    let page = 1;
    let allUsers: SupabaseUser[] = [];

    // Keep fetching until we get all users
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: 1000, // Max per page
      });

      if (error) {
        throw new Error(`Failed to fetch users: ${error.message}`);
      }

      const users = (data.users || []) as unknown as SupabaseUser[];
      if (users.length === 0) break;

      totalCount += users.length;

      // Only keep sample users for preview
      if (allUsers.length < limit) {
        allUsers.push(...users.slice(0, limit - allUsers.length));
      }

      // Check if there are more pages
      if (users.length < 1000) break;
      page++;
    }

    return {
      totalCount,
      sampleUsers: allUsers.slice(0, limit).map((u) => ({
        email: u.email || 'unknown@example.com', // Email should never be null, fallback if needed
        displayName:
          u.raw_user_meta_data?.full_name ||
          u.raw_user_meta_data?.name ||
          u.raw_user_meta_data?.display_name ||
          null,
        hasPassword: false, // Supabase API does not expose password hashes
        hasOAuth: !!u.identities && u.identities.length > 0,
        createdAt: u.created_at,
      })),
    };
  }
}

// Export singleton instance
export const supabaseImportService = new SupabaseImportService();