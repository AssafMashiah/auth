import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import { projects, rateLimitRules } from '../db/schema';
import type { Env, CreateProjectData, Project } from '../types';
import { generateJWTSecret } from '../utils/crypto';
import { generateProjectIdFromName, generateUserTableName, sanitizeTableName } from '../utils/helpers';
import { NotFoundError, ConflictError } from '../utils/errors';
import { auditService } from './audit-service';

/**
 * Project Service - Manages projects and dynamic user tables
 */
export class ProjectService {
  /**
   * Create a new project with its own user table
   * @param env - Environment bindings
   * @param data - Project data
   * @param adminUserId - Admin user creating the project
   * @returns Created project
   */
  async createProject(
    env: Env,
    data: CreateProjectData,
    adminUserId?: string
  ): Promise<Project> {
    const db = drizzle(env.DB);

    // Check if project with same name and environment already exists
    const existing = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.name, data.name),
          eq(projects.environment, data.environment || 'production')
        )
      )
      .get();

    if (existing) {
      throw new ConflictError('Project with this name already exists in this environment');
    }

    // Generate project ID from project name
    // Converts "Test Project" → "test_project", "My-Cool App!" → "my_cool_app"
    const projectId = generateProjectIdFromName(data.name);

    // Generate JWT secret
    const jwtSecret = generateJWTSecret();

    // Insert project (without user_table_name initially)
    // Note: Using explicit ID instead of SQL-based random generation
    const projectData = {
      id: projectId,
      name: data.name,
      description: data.description || null,
      environment: data.environment || 'production',
      jwtSecret,
      jwtAlgorithm: 'HS256',
      jwtExpirySeconds: data.jwtExpirySeconds || 3600,
      refreshTokenExpirySeconds: data.refreshTokenExpirySeconds || 604800,
      enabled: true,
      userTableName: '', // Will update after creating table
      createdBy: adminUserId || null,
    };

    const result = await db
      .insert(projects)
      .values(projectData)
      .returning()
      .get();

    if (!result) {
      throw new Error('Failed to create project');
    }

    const project = result as unknown as Project;

    // Generate user table name
    const userTableName = generateUserTableName(project.id);

    try {
      // Create dedicated user table for this project
      await this.createProjectUserTable(env.DB, project.id, userTableName);

      // Update project with user table name
      const updated = await db
        .update(projects)
        .set({ userTableName })
        .where(eq(projects.id, project.id))
        .returning()
        .get();

      // Create default rate limit rules
      await this.createDefaultRateLimits(env, project.id);

      // Log audit event
      await auditService.logEvent(env, {
        projectId: project.id,
        eventType: 'project_created',
        eventStatus: 'success',
        adminUserId,
        eventData: { userTableName, name: project.name },
      });

      return { ...project, userTableName };
    } catch (error) {
      // Rollback: Delete project if user table creation failed
      await db.delete(projects).where(eq(projects.id, project.id));
      throw error;
    }
  }

  /**
   * Create user table for a project
   * @param db - D1 database
   * @param projectId - Project ID
   * @param tableName - Table name
   */
  async createProjectUserTable(
    db: D1Database,
    projectId: string,
    tableName: string
  ): Promise<void> {
    const safeName = sanitizeTableName(tableName);

    // Create the user table - single line to avoid parsing issues
    const createTableSQL = `CREATE TABLE IF NOT EXISTS ${safeName} (id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), email TEXT UNIQUE NOT NULL, email_verified INTEGER DEFAULT 0, phone TEXT, phone_verified INTEGER DEFAULT 0, password_hash TEXT, oauth_provider TEXT, oauth_provider_user_id TEXT, oauth_raw_user_data TEXT, display_name TEXT, avatar_url TEXT, metadata TEXT, status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')), created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT, UNIQUE(oauth_provider, oauth_provider_user_id));`;

    await db.exec(createTableSQL);

    // Create partial unique index for phone (only when phone is not null)
    await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${safeName}_phone_unique ON ${safeName}(phone) WHERE phone IS NOT NULL;`);

    // Create regular indexes and trigger
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_${safeName}_email ON ${safeName}(email);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_${safeName}_oauth ON ${safeName}(oauth_provider, oauth_provider_user_id) WHERE oauth_provider IS NOT NULL;`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_${safeName}_status ON ${safeName}(status);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_${safeName}_created_at ON ${safeName}(created_at);`);

    // Create trigger for auto-updating timestamps
    const triggerSQL = `CREATE TRIGGER IF NOT EXISTS update_${safeName}_timestamp AFTER UPDATE ON ${safeName} FOR EACH ROW BEGIN UPDATE ${safeName} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;`;
    await db.exec(triggerSQL);
  }

  /**
   * Create default rate limit rules for a project
   * @param env - Environment bindings
   * @param projectId - Project ID
   */
  async createDefaultRateLimits(env: Env, projectId: string): Promise<void> {
    const db = drizzle(env.DB);

    const defaultRules = [
      {
        projectId,
        ruleType: 'per_ip' as const,
        windowSeconds: 60,
        maxAttempts: 5,
        action: 'block' as const,
        blockDurationSeconds: 300,
        enabled: true,
      },
      {
        projectId,
        ruleType: 'per_email' as const,
        windowSeconds: 300,
        maxAttempts: 3,
        action: 'block' as const,
        blockDurationSeconds: 900,
        enabled: true,
      },
    ];

    for (const rule of defaultRules) {
      await db.insert(rateLimitRules).values(rule);
    }
  }

  /**
   * Get project by ID
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @returns Project or null
   */
  async getProject(env: Env, projectId: string): Promise<Project | null> {
    const db = drizzle(env.DB);

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();

    if (!project) return null;

    // Parse redirectUrls from JSON string to array
    const result = project as any;
    if (result.redirectUrls && typeof result.redirectUrls === 'string') {
      try {
        result.redirectUrls = JSON.parse(result.redirectUrls);
      } catch {
        result.redirectUrls = null;
      }
    }

    return result as Project;
  }

  /**
   * Get project by name and environment
   * @param env - Environment bindings
   * @param name - Project name
   * @param environment - Environment
   * @returns Project or null
   */
  async getProjectByName(
    env: Env,
    name: string,
    environment: string = 'production'
  ): Promise<Project | null> {
    const db = drizzle(env.DB);

    const project = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.name, name),
          eq(projects.environment, environment as any)
        )
      )
      .get();

    if (!project) return null;

    // Parse redirectUrls from JSON string to array
    const result = project as any;
    if (result.redirectUrls && typeof result.redirectUrls === 'string') {
      try {
        result.redirectUrls = JSON.parse(result.redirectUrls);
      } catch {
        result.redirectUrls = null;
      }
    }

    return result as Project;
  }

  /**
   * List all projects
   * @param env - Environment bindings
   * @param filters - Optional filters
   * @returns List of projects
   */
  async listProjects(
    env: Env,
    filters?: {
      environment?: string;
      enabled?: boolean;
      search?: string;
    }
  ): Promise<Project[]> {
    const db = drizzle(env.DB);

    let query = db.select().from(projects);

    // Apply filters (simplified - would need proper query building)
    const results = await query.all();

    let filtered = results as unknown as Project[];

    // Parse redirectUrls for all projects
    filtered = filtered.map(p => {
      if (p.redirectUrls && typeof p.redirectUrls === 'string') {
        try {
          (p as any).redirectUrls = JSON.parse(p.redirectUrls as any);
        } catch {
          (p as any).redirectUrls = null;
        }
      }
      return p;
    });

    if (filters?.environment) {
      filtered = filtered.filter(p => p.environment === filters.environment);
    }

    if (filters?.enabled !== undefined) {
      filtered = filtered.filter(p => p.enabled === filters.enabled);
    }

    if (filters?.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(
        p => p.name.toLowerCase().includes(search) ||
          p.description?.toLowerCase().includes(search)
      );
    }

    return filtered;
  }

  /**
   * Update project
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param data - Update data
   * @param adminUserId - Admin user ID
   * @returns Updated project
   */
  async updateProject(
    env: Env,
    projectId: string,
    data: Partial<Project>,
    adminUserId?: string
  ): Promise<Project> {
    const db = drizzle(env.DB);

    const existing = await this.getProject(env, projectId);
    if (!existing) {
      throw new NotFoundError('Project not found');
    }

    // Convert redirectUrls array to JSON string for storage
    const updateData: any = { ...data };
    if (data.redirectUrls !== undefined) {
      updateData.redirectUrls = Array.isArray(data.redirectUrls)
        ? JSON.stringify(data.redirectUrls)
        : data.redirectUrls;
    }

    const updated = await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, projectId))
      .returning()
      .get();

    // Log audit event
    await auditService.logEvent(env, {
      projectId,
      eventType: 'project_updated',
      eventStatus: 'success',
      adminUserId,
      eventData: { changes: data },
    });

    return updated as unknown as Project;
  }

  /**
   * Delete project and its user table
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param adminUserId - Admin user ID
   */
  async deleteProject(
    env: Env,
    projectId: string,
    adminUserId?: string
  ): Promise<void> {
    const db = drizzle(env.DB);

    const project = await this.getProject(env, projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Drop user table
    if (project.userTableName) {
      const safeName = sanitizeTableName(project.userTableName);
      await env.DB.exec(`DROP TABLE IF EXISTS ${safeName};`);
    }

    // Delete project (cascade will delete related records)
    await db.delete(projects).where(eq(projects.id, projectId));

    // Log audit event
    await auditService.logEvent(env, {
      eventType: 'project_deleted',
      eventStatus: 'success',
      adminUserId,
      eventData: { projectId, name: project.name },
    });
  }

  /**
   * Rotate JWT secret for a project
   * @param env - Environment bindings
   * @param projectId - Project ID
   * @param adminUserId - Admin user ID
   * @returns New JWT secret
   */
  async rotateJWTSecret(
    env: Env,
    projectId: string,
    adminUserId?: string
  ): Promise<string> {
    const newSecret = generateJWTSecret();

    await this.updateProject(
      env,
      projectId,
      { jwtSecret: newSecret },
      adminUserId
    );

    return newSecret;
  }
}

// Export singleton instance
export const projectService = new ProjectService();