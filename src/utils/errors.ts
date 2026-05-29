/**
 * Custom error classes for the auth service
 */

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(401, message, 'AUTH_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, message, 'AUTHZ_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(400, message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', public retryAfter?: number) {
    super(429, message, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(409, message, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(400, message, 'BAD_REQUEST');
    this.name = 'BadRequestError';
  }
}

/**
 * Format error for API response
 */
export function formatError(error: Error | AppError) {
  if (error instanceof AppError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
    };
  }

  // Generic error
  return {
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    statusCode: 500,
  };
}