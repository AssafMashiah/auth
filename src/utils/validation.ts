import { z } from 'zod';

// ============================================================
// PROJECT VALIDATION
// ============================================================

export const createProjectSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(50, 'Name must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_ -]+$/, 'Name can only contain alphanumeric characters, hyphens, underscores, and spaces'),
  description: z.string().optional(),
  environment: z.enum(['development', 'staging', 'production']).default('production'),
  jwtExpirySeconds: z.number().int().min(60).max(86400).default(3600),
  refreshTokenExpirySeconds: z.number().int().min(3600).max(2592000).default(604800),
  // Site URL for generating email callback links (email confirmation, password reset, etc.)
  // Should include protocol (e.g., 'https://example.com')
  siteUrl: z.string()
    .url('Site URL must be a valid URL with protocol (e.g., https://example.com)')
    .optional(),
  // Allowed redirect URLs for additional security (similar to Supabase's allowlist)
  redirectUrls: z.array(
    z.string().url('Each redirect URL must be a valid URL')
  ).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_ -]+$/, 'Name can only contain alphanumeric characters, hyphens, underscores, and spaces')
    .optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  jwtExpirySeconds: z.number().int().min(60).max(86400).optional(),
  refreshTokenExpirySeconds: z.number().int().min(3600).max(2592000).optional(),
  // Site URL for generating email callback links
  siteUrl: z.string()
    .url('Site URL must be a valid URL with protocol')
    .optional(),
  // Allowed redirect URLs
  redirectUrls: z.array(
    z.string().url('Each redirect URL must be a valid URL')
  ).optional(),
});

// ============================================================
// OAUTH PROVIDER VALIDATION
// ============================================================

export const createOAuthProviderSchema = z.object({
  providerName: z.enum(["google", "github", "microsoft", "apple", "custom"]),
  enabled: z.boolean().default(true),
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
  authorizationUrl: z.string().url().optional(),
  tokenUrl: z.string().url().optional(),
  userInfoUrl: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  additionalConfig: z.record(z.string(), z.any()).optional(),
});

export const updateOAuthProviderSchema = z.object({
  enabled: z.boolean().optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  authorizationUrl: z.string().url().optional(),
  tokenUrl: z.string().url().optional(),
  userInfoUrl: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  additionalConfig: z.record(z.string(), z.any()).optional(),
});

// ============================================================
// AUTH VALIDATION
// ============================================================

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  displayName: z.string().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

// ============================================================
// ADMIN VALIDATION
// ============================================================

export const adminLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createAdminUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(12, 'Admin password must be at least 12 characters')
    .max(72, 'Password must be at most 72 characters'),
  displayName: z.string().min(1, 'Display name is required'),
  role: z.enum(['super_admin', 'admin', 'viewer']).default('admin'),
});

export const updateAdminUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  role: z.enum(['super_admin', 'admin', 'viewer']).optional(),
  enabled: z.boolean().optional(),
});

// ============================================================
// RATE LIMIT VALIDATION
// ============================================================

export const createRateLimitRuleSchema = z.object({
  ruleType: z.enum(['per_ip', 'per_email', 'per_project']),
  windowSeconds: z.number().int().min(1).max(3600),
  maxAttempts: z.number().int().min(1).max(1000),
  action: z.enum(['block', 'delay', 'captcha']).default('block'),
  blockDurationSeconds: z.number().int().min(60).max(86400).default(300),
  enabled: z.boolean().default(true),
});

// ============================================================
// SUPABASE IMPORT VALIDATION
// ============================================================

export const validateSupabaseCredentialsSchema = z.object({
  supabaseUrl: z.string().url('Invalid Supabase URL'),
  supabaseServiceKey: z.string().min(1, 'Service key is required'),
});

export const importFromSupabaseSchema = z.object({
  supabaseUrl: z.string().url('Invalid Supabase URL'),
  supabaseServiceKey: z.string().min(1, 'Service key is required'),
  options: z.object({
    batchSize: z.number().int().min(1).max(1000).default(100).optional(),
    skipExisting: z.boolean().default(true).optional(),
    preserveIds: z.boolean().default(false).optional(),
    importMetadata: z.boolean().default(true).optional(),
    preserveOAuth: z.boolean().default(true).optional(),
  }).optional(),
});

export const getImportPreviewSchema = z.object({
  supabaseUrl: z.string().url('Invalid Supabase URL'),
  supabaseServiceKey: z.string().min(1, 'Service key is required'),
  limit: z.number().int().min(1).max(20).default(5).optional(),
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Validate data against a schema
 * @param schema - Zod schema
 * @param data - Data to validate
 * @returns Validated data
 * @throws ValidationError if validation fails
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map(
      (e) => `${e.path.join(".")}: ${e.message}`,
    );
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }
  return result.data;
}

/**
 * Validate email format
 * @param email - Email to validate
 * @returns True if valid
 */
export function isValidEmail(email: string): boolean {
  return z.string().email().safeParse(email).success;
}

/**
 * Sanitize project name for table creation
 * @param name - Project name
 * @returns Sanitized name safe for SQL identifiers
 */
export function sanitizeProjectName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}