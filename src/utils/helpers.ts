/**
 * Helper utility functions
 */

/**
 * Add seconds to a date
 * @param date - Base date
 * @param seconds - Seconds to add
 * @returns New date
 */
export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

/**
 * Get ISO timestamp string
 * @param date - Date object
 * @returns ISO string
 */
export function getTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * Check if a date has expired
 * @param expiryDate - Expiry date string (ISO format)
 * @returns True if expired
 */
export function isExpired(expiryDate: string): boolean {
  return new Date(expiryDate) < new Date();
}

/**
 * Parse JSON safely
 * @param json - JSON string
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed object or default value
 */
export function safeJsonParse<T>(json: string | null, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Stringify JSON safely
 * @param obj - Object to stringify
 * @returns JSON string or null
 */
export function safeJsonStringify(obj: any): string | null {
  try {
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}

/**
 * Extract IP address from request
 * @param request - Request object
 * @returns IP address
 */
export function getIpAddress(request: Request): string {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

/**
 * Extract user agent from request
 * @param request - Request object
 * @returns User agent string
 */
export function getUserAgent(request: Request): string {
  return request.headers.get('user-agent') || 'unknown';
}

/**
 * Create pagination info
 * @param total - Total items
 * @param page - Current page
 * @param perPage - Items per page
 * @returns Pagination object
 */
export function createPaginationInfo(total: number, page: number, perPage: number) {
  return {
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
    hasNext: page * perPage < total,
    hasPrev: page > 1,
  };
}

/**
 * Sanitize table name for SQL (prevent injection)
 * @param tableName - Table name
 * @returns Sanitized table name
 */
export function sanitizeTableName(tableName: string): string {
  // Only allow alphanumeric and underscore
  return tableName.replace(/[^a-zA-Z0-9_]/g, '');
}

/**
 * Generate project ID from project name
 * Converts project name to a URL-safe and SQL-safe identifier
 * @param name - Project name (e.g., "Test Project", "My-Cool App!")
 * @returns Project ID (e.g., "test_project", "my_cool_app")
 */
export function generateProjectIdFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Replace spaces with underscores
    .replace(/\s+/g, '_')
    // Replace any non-alphanumeric characters (except underscore) with underscore
    .replace(/[^a-z0-9_]/g, '_')
    // Replace multiple consecutive underscores with single underscore
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '');
}

/**
 * Generate user table name for a project
 * @param projectId - Project ID (should already be sanitized)
 * @returns Table name in format "{id}_users"
 */
export function generateUserTableName(projectId: string): string {
  return `${sanitizeTableName(projectId)}_users`;
}

/**
 * Mask sensitive data for logging
 * @param data - Data to mask
 * @returns Masked string
 */
export function maskSensitiveData(data: string): string {
  if (data.length <= 8) {
    return '***';
  }
  const start = data.substring(0, 4);
  const end = data.substring(data.length - 4);
  return `${start}...${end}`;
}

/**
 * Sleep for specified milliseconds
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format bytes to human readable
 * @param bytes - Number of bytes
 * @returns Formatted string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Generate a random hex string
 * @param length - Length of hex string
 * @returns Random hex string
 */
export function randomHex(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, length);
}