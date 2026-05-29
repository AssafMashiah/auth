import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc } from 'drizzle-orm';
import { auditLogs } from '../db/schema';
import type { Env, CreateAuditLogData, AuditLog } from '../types';
import { getTimestamp } from '../utils/helpers';

/**
 * Audit Service - Handles security and admin action logging
 */
export class AuditService {
  /**
   * Log an audit event
   * @param env - Environment bindings
   * @param data - Audit log data
   */
  async logEvent(env: Env, data: CreateAuditLogData): Promise<void> {
    const db = drizzle(env.DB);

    await db.insert(auditLogs).values({
      projectId: data.projectId || null,
      eventType: data.eventType,
      eventStatus: data.eventStatus || 'success',
      userId: data.userId || null,
      adminUserId: data.adminUserId || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      eventData: data.eventData ? JSON.stringify(data.eventData) : null,
    });
  }

  /**
   * Get audit logs with filters
   * @param env - Environment bindings
   * @param filters - Filter options
   * @returns List of audit logs
   */
  async getAuditLogs(
    env: Env,
    filters?: {
      projectId?: string;
      eventType?: string;
      adminUserId?: string;
      userId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditLog[]> {
    const db = drizzle(env.DB);

    let query = db.select().from(auditLogs);

    // Apply filters (simplified version)
    const results = await query.orderBy(desc(auditLogs.createdAt)).all();

    let filtered = results as unknown as AuditLog[];

    if (filters?.projectId) {
      filtered = filtered.filter(log => log.projectId === filters.projectId);
    }

    if (filters?.eventType) {
      filtered = filtered.filter(log => log.eventType === filters.eventType);
    }

    if (filters?.adminUserId) {
      filtered = filtered.filter(log => log.adminUserId === filters.adminUserId);
    }

    if (filters?.userId) {
      filtered = filtered.filter(log => log.userId === filters.userId);
    }

    if (filters?.startDate) {
      filtered = filtered.filter(log => log.createdAt >= filters.startDate!);
    }

    if (filters?.endDate) {
      filtered = filtered.filter(log => log.createdAt <= filters.endDate!);
    }

    // Apply pagination
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;

    return filtered.slice(offset, offset + limit);
  }

  /**
   * Get audit logs for a specific project
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param limit - Max results
   * @returns List of audit logs
   */
  async getProjectAuditLogs(
    env: Env,
    projectId: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    return this.getAuditLogs(env, { projectId, limit });
  }

  /**
   * Get recent audit logs
   * @param env - Environment bindings
   * @param limit - Max results
   * @returns List of audit logs
   */
  async getRecentLogs(env: Env, limit: number = 100): Promise<AuditLog[]> {
    return this.getAuditLogs(env, { limit });
  }

  /**
   * Count audit logs matching filters
   * @param env - Environment bindings
   * @param filters - Filter options
   * @returns Count
   */
  async countAuditLogs(
    env: Env,
    filters?: {
      projectId?: string;
      eventType?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<number> {
    const logs = await this.getAuditLogs(env, { ...filters, limit: 10000 });
    return logs.length;
  }
}

// Export singleton instance
export const auditService = new AuditService();