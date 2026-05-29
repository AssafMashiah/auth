# CLAUDE.md - Development Guidelines

## Project Overview

This is a Cloudflare Workers-based authentication service with multi-project support. It provides user authentication, OAuth integration (Google, GitHub, Microsoft), email services (SendGrid), and admin dashboard.

## TDD (Test-Driven Development) Workflow

All new features and bug fixes MUST follow this workflow:

1. **Write the test first** - Create a failing test that describes the expected behavior
2. **Run the test** - Verify it fails
3. **Implement the feature** - Write the minimum code to make the test pass
4. **Refactor** - Improve code while keeping tests passing
5. **Commit** - Only after tests pass

### Before Adding Any Feature

- Create unit tests in `test/` directory matching the source file structure
- Tests MUST exist BEFORE any implementation changes
- Run `npm test` to verify tests pass
- Target 100% test coverage

## Testing Standards

### Test File Organization

```
test/
├── services/
│   ├── auth-service.test.ts
│   ├── oauth-service.test.ts
│   ├── email-service.test.ts
│   └── ...
├── utils/
│   ├── helpers.test.ts
│   ├── validation.test.ts
│   ├── errors.test.ts
│   └── crypto.test.ts
└── e2e/
    └── ...
```

### Test Structure

Each test file should follow this pattern:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceName } from '../../src/services/service-name';

describe('ServiceName', () => {
  let service: ServiceName;
  let mockEnv: Env;

  beforeEach(() => {
    service = new ServiceName();
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do something specific', async () => {
      // Arrange
      const input = 'test-input';
      
      // Act
      const result = await service.methodName(input, mockEnv);
      
      // Assert
      expect(result).toBe('expected-output');
    });

    it('should handle error case', async () => {
      // Arrange
      const input = 'invalid';
      
      // Act & Assert
      await expect(service.methodName(input, mockEnv))
        .rejects.toThrow(ErrorType);
    });
  });
});
```

### Mocking Guidelines

- Use `vi.fn()` for mocking functions
- Mock external dependencies (D1, external APIs)
- Use `createMockEnv()` helper for consistent environment mocking

### Test Coverage Requirements

- All exported functions MUST have tests
- All edge cases MUST be covered
- Error handling MUST be tested
- Integration points (OAuth, email providers) SHOULD be mocked

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- test/utils/helpers.test.ts
```

## CI/CD Requirements

All tests MUST pass before code can be merged. This includes:
- Unit tests pass
- Coverage meets or exceeds current levels
- No TypeScript errors (`npm run type-check`)

## Integration Testing

For external integrations (Google OAuth, SendGrid, etc.), use mocks in unit tests. End-to-end tests can use test credentials stored in environment variables.
