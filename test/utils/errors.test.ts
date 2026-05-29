import { describe, it, expect } from 'vitest';
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ConflictError,
  BadRequestError,
  formatError,
} from '../../src/utils/errors';

describe('Error Utils', () => {
  describe('AppError', () => {
    it('should create error with status code and message', () => {
      const error = new AppError(400, 'Bad request');

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Bad request');
      expect(error.name).toBe('AppError');
    });

    it('should include error code', () => {
      const error = new AppError(400, 'Bad request', 'BAD_REQUEST');

      expect(error.code).toBe('BAD_REQUEST');
    });
  });

  describe('AuthenticationError', () => {
    it('should create 401 error', () => {
      const error = new AuthenticationError();

      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('AuthenticationError');
      expect(error.code).toBe('AUTH_ERROR');
    });

    it('should accept custom message', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });
  });

  describe('AuthorizationError', () => {
    it('should create 403 error', () => {
      const error = new AuthorizationError();

      expect(error.statusCode).toBe(403);
      expect(error.name).toBe('AuthorizationError');
      expect(error.code).toBe('AUTHZ_ERROR');
    });

    it('should accept custom message', () => {
      const error = new AuthorizationError('Admin access required');

      expect(error.message).toBe('Admin access required');
    });
  });

  describe('NotFoundError', () => {
    it('should create 404 error', () => {
      const error = new NotFoundError();

      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('NotFoundError');
      expect(error.code).toBe('NOT_FOUND');
    });

    it('should accept custom message', () => {
      const error = new NotFoundError('User not found');

      expect(error.message).toBe('User not found');
    });
  });

  describe('ValidationError', () => {
    it('should create 400 error with validation code', () => {
      const error = new ValidationError();

      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept custom message', () => {
      const error = new ValidationError('Invalid email format');

      expect(error.message).toBe('Invalid email format');
    });
  });

  describe('RateLimitError', () => {
    it('should create 429 error', () => {
      const error = new RateLimitError();

      expect(error.statusCode).toBe(429);
      expect(error.name).toBe('RateLimitError');
      expect(error.code).toBe('RATE_LIMIT_ERROR');
    });

    it('should include retryAfter', () => {
      const error = new RateLimitError('Rate limited', 60);

      expect(error.retryAfter).toBe(60);
    });

    it('should accept custom message', () => {
      const error = new RateLimitError('Too many requests');

      expect(error.message).toBe('Too many requests');
    });
  });

  describe('ConflictError', () => {
    it('should create 409 error', () => {
      const error = new ConflictError();

      expect(error.statusCode).toBe(409);
      expect(error.name).toBe('ConflictError');
      expect(error.code).toBe('CONFLICT_ERROR');
    });

    it('should accept custom message', () => {
      const error = new ConflictError('Email already exists');

      expect(error.message).toBe('Email already exists');
    });
  });

  describe('BadRequestError', () => {
    it('should create 400 error', () => {
      const error = new BadRequestError();

      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('BadRequestError');
      expect(error.code).toBe('BAD_REQUEST');
    });

    it('should accept custom message', () => {
      const error = new BadRequestError('Missing required field');

      expect(error.message).toBe('Missing required field');
    });
  });

  describe('formatError', () => {
    it('should format AppError correctly', () => {
      const error = new NotFoundError('User not found');
      const formatted = formatError(error);

      expect(formatted).toEqual({
        success: false,
        error: 'User not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('should format AppError without code', () => {
      const error = new AppError(500, 'Internal error');
      const formatted = formatError(error);

      expect(formatted).toEqual({
        success: false,
        error: 'Internal error',
        code: undefined,
        statusCode: 500,
      });
    });

    it('should format generic Error', () => {
      const error = new Error('Something went wrong');
      const formatted = formatError(error);

      expect(formatted).toEqual({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      });
    });

    it('should include custom codes for different error types', () => {
      const errors = [
        { error: new AuthenticationError(), code: 'AUTH_ERROR' },
        { error: new AuthorizationError(), code: 'AUTHZ_ERROR' },
        { error: new NotFoundError(), code: 'NOT_FOUND' },
        { error: new ValidationError(), code: 'VALIDATION_ERROR' },
        { error: new RateLimitError(), code: 'RATE_LIMIT_ERROR' },
        { error: new ConflictError(), code: 'CONFLICT_ERROR' },
        { error: new BadRequestError(), code: 'BAD_REQUEST' },
      ];

      errors.forEach(({ error, code }) => {
        const formatted = formatError(error);
        expect(formatted.code).toBe(code);
      });
    });
  });
});