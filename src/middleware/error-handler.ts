import { Context } from 'hono';
import { AppError, formatError } from '../utils/errors';

/**
 * Global error handler middleware
 */
export async function errorHandler(err: Error, c: Context) {
  console.error('Error:', err);

  if (err instanceof AppError) {
    return c.json(formatError(err), err.statusCode as any);
  }

  // Generic error
  return c.json(
    {
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
    500
  );
}