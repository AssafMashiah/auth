import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc, sql } from 'drizzle-orm';
import { authAttempts, rateLimitRules } from '../db/schema';
import type { Env, RateLimitRule } from '../types';
import { RateLimitError } from '../utils/errors';

/**
 * Rate Limit Service - Handles rate limiting and attempt tracking
 */
export class RateLimitService {
  /**
   * Check if rate limit has been exceeded
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param attemptType - Type of attempt
   * @param ipAddress - IP address
   * @param email - Email (optional)
   * @throws RateLimitError if limit exceeded
   */
  async checkRateLimit(
    env: Env,
    projectId: string,
    attemptType: string,
    ipAddress: string,
    email?: string
  ): Promise<void> {
    const db = drizzle(env.DB);

    // Get rate limit rules for this project
    const rules = await db
      .select()
      .from(rateLimitRules)
      .where(
        and(
          eq(rateLimitRules.projectId, projectId),
          eq(rateLimitRules.enabled, true)
        )
      )
      .all();

    for (const rule of rules as unknown as RateLimitRule[]) {
      const isLimited = await this.checkRule(env, projectId, rule, ipAddress, email);
      if (isLimited) {
        throw new RateLimitError(
          `Rate limit exceeded. Please try again later.`,
          rule.blockDurationSeconds
        );
      }
    }
  }

  /**
   * Check a specific rate limit rule
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param rule - Rate limit rule
   * @param ipAddress - IP address
   * @param email - Email (optional)
   * @returns True if limit exceeded
   */
  private async checkRule(
    env: Env,
    projectId: string,
    rule: RateLimitRule,
    ipAddress: string,
    email?: string
  ): Promise<boolean> {
    const db = drizzle(env.DB);

    // Calculate time window
    const windowStart = new Date(Date.now() - rule.windowSeconds * 1000).toISOString();

    // Build conditions array
    const conditions = [
      eq(authAttempts.projectId, projectId),
      eq(authAttempts.success, false),
      sql`${authAttempts.createdAt} > ${windowStart}`
    ];

    // Apply rule-specific filters
    if (rule.ruleType === 'per_ip') {
      conditions.push(eq(authAttempts.ipAddress, ipAddress));
    } else if (rule.ruleType === 'per_email' && email) {
      conditions.push(eq(authAttempts.email, email));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(authAttempts)
      .where(and(...conditions))
      .get();

    const count = result?.count || 0;

    return count >= rule.maxAttempts;
  }

  /**
   * Record an authentication attempt
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param attemptType - Type of attempt
   * @param ipAddress - IP address
   * @param email - Email (optional)
   * @param success - Whether attempt succeeded
   * @param userId - User ID (if successful)
   * @param failureReason - Failure reason (if failed)
   */
  async recordAttempt(
    env: Env,
    projectId: string,
    attemptType: string,
    ipAddress: string,
    email: string | undefined,
    success: boolean,
    userId?: string,
    failureReason?: string
  ): Promise<void> {
    const db = drizzle(env.DB);

    await db.insert(authAttempts).values({
      projectId,
      attemptType: attemptType as any,
      email: email || null,
      ipAddress,
      userAgent: null, // Could be passed if needed
      success,
      failureReason: failureReason || null,
      userId: userId || null,
    });
  }

  /**
   * Clear failed attempts for an email (after successful login)
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param email - Email
   */
  async clearAttempts(
    env: Env,
    projectId: string,
    email: string
  ): Promise<void> {
    // In SQLite/D1, we can't easily delete old records
    // Instead, we just let them age out naturally
    // Or we could mark them as cleared in a future enhancement
  }

  /**
   * Get recent failed attempts
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param limit - Max results
   * @returns List of attempts
   */
  async getRecentFailedAttempts(
    env: Env,
    projectId: string,
    limit: number = 50
  ) {
    const db = drizzle(env.DB);

    return await db
      .select()
      .from(authAttempts)
      .where(
        and(
          eq(authAttempts.projectId, projectId),
          eq(authAttempts.success, false)
        )
      )
      .orderBy(desc(authAttempts.createdAt))
      .limit(limit)
      .all();
  }

  /**
   * Get rate limit rules for a project
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @returns List of rules
   */
  async getRules(env: Env, projectId: string): Promise<RateLimitRule[]> {
    const db = drizzle(env.DB);

    const rules = await db
      .select()
      .from(rateLimitRules)
      .where(eq(rateLimitRules.projectId, projectId))
      .all();

    return rules as unknown as RateLimitRule[];
  }

  /**
   * Create or update a rate limit rule
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param ruleData - Rule data
   * @returns Created/updated rule
   */
  async setRule(
    env: Env,
    projectId: string,
    ruleData: {
      ruleType: 'per_ip' | 'per_email' | 'per_project';
      windowSeconds: number;
      maxAttempts: number;
      action?: 'block' | 'delay' | 'captcha';
      blockDurationSeconds?: number;
      enabled?: boolean;
    }
  ): Promise<RateLimitRule> {
    const db = drizzle(env.DB);

    // Check if rule exists
    const existing = await db
      .select()
      .from(rateLimitRules)
      .where(
        and(
          eq(rateLimitRules.projectId, projectId),
          eq(rateLimitRules.ruleType, ruleData.ruleType)
        )
      )
      .get();

    if (existing) {
      // Update existing rule
      const updated = await db
        .update(rateLimitRules)
        .set({
          windowSeconds: ruleData.windowSeconds,
          maxAttempts: ruleData.maxAttempts,
          action: ruleData.action || 'block',
          blockDurationSeconds: ruleData.blockDurationSeconds || 300,
          enabled: ruleData.enabled !== undefined ? ruleData.enabled : true,
        })
        .where(eq(rateLimitRules.id, existing.id))
        .returning()
        .get();

      return updated as unknown as RateLimitRule;
    } else {
      // Create new rule
      const created = await db
        .insert(rateLimitRules)
        .values({
          projectId,
          ruleType: ruleData.ruleType,
          windowSeconds: ruleData.windowSeconds,
          maxAttempts: ruleData.maxAttempts,
          action: ruleData.action || 'block',
          blockDurationSeconds: ruleData.blockDurationSeconds || 300,
          enabled: ruleData.enabled !== undefined ? ruleData.enabled : true,
        })
        .returning()
        .get();

      return created as unknown as RateLimitRule;
    }
  }
}

// Export singleton instance
export const rateLimitService = new RateLimitService();