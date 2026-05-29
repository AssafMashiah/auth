// API Documentation Data Structure
export interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  title: string;
  description: string;
  category: string;
  authentication?: 'Admin Session' | 'JWT Bearer' | 'None';
  headers?: Record<string, string>;
  requestBody?: {
    type: string;
    example: any;
    schema: Record<string, any>;
  };
  responses: {
    status: number;
    description: string;
    example: any;
  }[];
}

export const apiEndpoints: APIEndpoint[] = [
  // Admin Authentication
  {
    method: 'POST',
    path: '/api/admin/login',
    title: 'Admin Login',
    description: 'Authenticate as an admin user and receive a session token',
    category: 'Admin Auth',
    authentication: 'None',
    requestBody: {
      type: 'application/json',
      schema: {
        email: 'string (required)',
        password: 'string (required)',
      },
      example: {
        email: 'admin@example.com',
        password: 'SecurePassword123!',
      },
    },
    responses: [
      {
        status: 200,
        description: 'Login successful',
        example: {
          success: true,
          data: {
            sessionToken: 'admin_session_token_here',
            admin: {
              id: 'admin-id',
              email: 'admin@example.com',
              displayName: 'Admin User',
              role: 'super_admin',
            },
          },
        },
      },
      {
        status: 401,
        description: 'Invalid credentials',
        example: {
          success: false,
          error: 'Invalid credentials',
          code: 'AUTH_ERROR',
        },
      },
    ],
  },
  {
    method: 'POST',
    path: '/api/admin/logout',
    title: 'Admin Logout',
    description: 'Invalidate the current admin session',
    category: 'Admin Auth',
    authentication: 'Admin Session',
    headers: {
      'X-Admin-Session': 'your_session_token',
    },
    responses: [
      {
        status: 200,
        description: 'Logout successful',
        example: {
          success: true,
          message: 'Logged out successfully',
        },
      },
    ],
  },

  // Projects Management
  {
    method: 'GET',
    path: '/api/admin/projects',
    title: 'List Projects',
    description: 'Get list of all authentication projects',
    category: 'Projects',
    authentication: 'Admin Session',
    headers: {
      'X-Admin-Session': 'your_session_token',
    },
    responses: [
      {
        status: 200,
        description: 'Projects list retrieved',
        example: {
          success: true,
          data: [
            {
              id: 'project-id',
              name: 'my-app',
              description: 'My Application',
              environment: 'production',
              enabled: true,
              userTableName: 'project_abc123_users',
              createdAt: '2025-11-03T00:00:00Z',
            },
          ],
          total: 1,
        },
      },
    ],
  },
  {
    method: 'POST',
    path: '/api/admin/projects',
    title: 'Create Project',
    description: 'Create a new authentication project',
    category: 'Projects',
    authentication: 'Admin Session',
    headers: {
      'X-Admin-Session': 'your_session_token',
    },
    requestBody: {
      type: 'application/json',
      schema: {
        name: 'string (required) - lowercase, hyphens, underscores only',
        description: 'string (optional)',
        environment: 'string (optional) - development | staging | production',
      },
      example: {
        name: 'my-app',
        description: 'My Application',
        environment: 'production',
      },
    },
    responses: [
      {
        status: 201,
        description: 'Project created successfully',
        example: {
          success: true,
          data: {
            id: 'project-id',
            name: 'my-app',
            jwtSecret: 'generated_jwt_secret',
            userTableName: 'project_abc123_users',
          },
          message: 'Project created successfully',
        },
      },
    ],
  },
  {
    method: 'GET',
    path: '/api/admin/projects/:id',
    title: 'Get Project',
    description: 'Get details of a specific project',
    category: 'Projects',
    authentication: 'Admin Session',
    headers: {
      'X-Admin-Session': 'your_session_token',
    },
    responses: [
      {
        status: 200,
        description: 'Project details',
        example: {
          success: true,
          data: {
            id: 'project-id',
            name: 'my-app',
            description: 'My Application',
            environment: 'production',
            jwtSecret: 'jwt_secret',
            enabled: true,
          },
        },
      },
    ],
  },
  {
    method: 'DELETE',
    path: '/api/admin/projects/:id',
    title: 'Delete Project',
    description: 'Delete a project and all associated data',
    category: 'Projects',
    authentication: 'Admin Session',
    headers: {
      'X-Admin-Session': 'your_session_token',
    },
    responses: [
      {
        status: 200,
        description: 'Project deleted',
        example: {
          success: true,
          message: 'Project deleted successfully',
        },
      },
    ],
  },

  // User Authentication
  {
    method: 'POST',
    path: '/api/auth/:projectId/register',
    title: 'Register User',
    description: 'Register a new user in a project',
    category: 'User Auth',
    authentication: 'None',
    requestBody: {
      type: 'application/json',
      schema: {
        email: 'string (required)',
        password: 'string (required) - min 8 chars',
        firstName: 'string (optional)',
        lastName: 'string (optional)',
      },
      example: {
        email: 'user@example.com',
        password: 'UserPassword123!',
        firstName: 'John',
        lastName: 'Doe',
      },
    },
    responses: [
      {
        status: 201,
        description: 'User registered successfully',
        example: {
          success: true,
          data: {
            user: {
              id: 'user-id',
              email: 'user@example.com',
              displayName: 'John Doe',
            },
            accessToken: 'jwt_access_token',
            refreshToken: 'refresh_token',
          },
        },
      },
    ],
  },
  {
    method: 'POST',
    path: '/api/auth/:projectId/login',
    title: 'User Login',
    description: 'Authenticate a user and receive access tokens',
    category: 'User Auth',
    authentication: 'None',
    requestBody: {
      type: 'application/json',
      schema: {
        email: 'string (required)',
        password: 'string (required)',
      },
      example: {
        email: 'user@example.com',
        password: 'UserPassword123!',
      },
    },
    responses: [
      {
        status: 200,
        description: 'Login successful',
        example: {
          success: true,
          data: {
            user: {
              id: 'user-id',
              email: 'user@example.com',
              displayName: 'John Doe',
            },
            accessToken: 'jwt_access_token',
            refreshToken: 'refresh_token',
          },
        },
      },
    ],
  },
  {
    method: 'POST',
    path: '/api/auth/:projectId/refresh',
    title: 'Refresh Access Token',
    description: 'Get a new access token and refresh token using an existing refresh token. The old refresh token will be revoked.',
    category: 'User Auth',
    authentication: 'None',
    requestBody: {
      type: 'application/json',
      schema: {
        refreshToken: 'string (required)',
      },
      example: {
        refreshToken: 'your_refresh_token_here',
      },
    },
    responses: [
      {
        status: 200,
        description: 'Token refreshed successfully',
        example: {
          success: true,
          data: {
            accessToken: 'new_jwt_access_token',
            refreshToken: 'new_refresh_token',
          },
        },
      },
      {
        status: 401,
        description: 'Invalid or expired refresh token',
        example: {
          success: false,
          error: 'Invalid refresh token',
          code: 'AUTH_ERROR',
        },
      },
    ],
  },
  {
    method: 'POST',
    path: '/api/auth/:projectId/logout',
    title: 'User Logout',
    description: 'Logout user and revoke refresh token',
    category: 'User Auth',
    authentication: 'None',
    requestBody: {
      type: 'application/json',
      schema: {
        refreshToken: 'string (required)',
      },
      example: {
        refreshToken: 'your_refresh_token_here',
      },
    },
    responses: [
      {
        status: 200,
        description: 'Logout successful',
        example: {
          success: true,
          message: 'Logged out successfully',
        },
      },
    ],
  },
  {
    method: 'GET',
    path: '/api/auth/:projectId/me',
    title: 'Get Current User',
    description: 'Get the authenticated user\'s information',
    category: 'User Auth',
    authentication: 'JWT Bearer',
    headers: {
      'Authorization': 'Bearer your_access_token',
    },
    responses: [
      {
        status: 200,
        description: 'User information',
        example: {
          success: true,
          data: {
            id: 'user-id',
            email: 'user@example.com',
            displayName: 'John Doe',
            emailVerified: true,
            status: 'active',
            createdAt: '2025-11-03T00:00:00Z',
          },
        },
      },
    ],
  },
  {
    method: 'POST',
    path: '/api/auth/:projectId/forgot-password',
    title: 'Forgot Password',
    description: 'Request a password reset email',
    category: 'User Auth',
    authentication: 'None',
    requestBody: {
      type: 'application/json',
      schema: {
        email: 'string (required)',
      },
      example: {
        email: 'user@example.com',
      },
    },
    responses: [
      {
        status: 200,
        description: 'Request processed (always returns success)',
        example: {
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent',
        },
      },
    ],
  },
  {
    method: 'POST',
    path: '/api/auth/:projectId/reset-password',
    title: 'Reset Password',
    description: 'Reset user password with token from email',
    category: 'User Auth',
    authentication: 'None',
    requestBody: {
      type: 'application/json',
      schema: {
        token: 'string (required)',
        newPassword: 'string (required) - min 8 chars',
      },
      example: {
        token: 'reset_token_from_email',
        newPassword: 'NewPassword123!',
      },
    },
    responses: [
      {
        status: 200,
        description: 'Password reset successfully',
        example: {
          success: true,
          message: 'Password has been reset successfully',
        },
      },
    ],
  },
  {
    method: 'GET',
    path: '/api/auth/:projectId/confirm-email',
    title: 'Confirm Email',
    description: 'Confirm user email address with token',
    category: 'User Auth',
    authentication: 'None',
    requestBody: {
      type: 'query',
      schema: {
        token: 'string (required)',
      },
      example: {
        token: 'confirmation_token_from_email',
      },
    },
    responses: [
      {
        status: 200,
        description: 'Email confirmed successfully',
        example: {
          success: true,
          message: 'Email confirmed successfully',
          data: { email: 'user@example.com' },
        },
      },
    ],
  },

  // Admin Users Management
  {
    method: 'GET',
    path: '/api/admin/users',
    title: 'List Admin Users',
    description: 'Get list of all admin users',
    category: 'Admin Users',
    authentication: 'Admin Session',
    headers: {
      'X-Admin-Session': 'your_session_token',
    },
    responses: [
      {
        status: 200,
        description: 'Admin users list',
        example: {
          success: true,
          data: [
            {
              id: 'admin-id',
              email: 'admin@example.com',
              displayName: 'Admin User',
              role: 'super_admin',
              enabled: true,
              createdAt: '2025-11-03T00:00:00Z',
            },
          ],
        },
      },
    ],
  },
  {
    method: 'POST',
    path: '/api/admin/users',
    title: 'Create Admin User',
    description: 'Create a new admin user',
    category: 'Admin Users',
    authentication: 'Admin Session',
    headers: {
      'X-Admin-Session': 'your_session_token',
    },
    requestBody: {
      type: 'application/json',
      schema: {
        email: 'string (required)',
        password: 'string (required) - min 8 chars',
        displayName: 'string (required)',
        role: 'string (required) - super_admin | admin | viewer',
      },
      example: {
        email: 'newadmin@example.com',
        password: 'AdminPass123!',
        displayName: 'New Admin',
        role: 'admin',
      },
    },
    responses: [
      {
        status: 201,
        description: 'Admin user created',
        example: {
          success: true,
          data: {
            id: 'admin-id',
            email: 'newadmin@example.com',
            displayName: 'New Admin',
            role: 'admin',
          },
          message: 'Admin user created successfully',
        },
      },
    ],
  },

  // Project Users Management
  {
    method: 'GET',
    path: '/api/admin/projects/:projectId/users',
    title: 'List Project Users',
    description: 'Get list of users in a specific project',
    category: 'Project Users',
    authentication: 'Admin Session',
    headers: {
      'X-Admin-Session': 'your_session_token',
    },
    responses: [
      {
        status: 200,
        description: 'Project users list',
        example: {
          success: true,
          data: [
            {
              id: 'user-id',
              email: 'user@example.com',
              displayName: 'John Doe',
              emailVerified: true,
              status: 'active',
              createdAt: '2025-11-03T00:00:00Z',
            },
          ],
          total: 1,
        },
      },
    ],
  },
  {
    method: 'POST',
    path: '/api/admin/projects/:projectId/users',
    title: 'Create Project User',
    description: 'Create a new user in a project',
    category: 'Project Users',
    authentication: 'Admin Session',
    headers: {
      'X-Admin-Session': 'your_session_token',
    },
    requestBody: {
      type: 'application/json',
      schema: {
        email: 'string (required)',
        password: 'string (required)',
        firstName: 'string (optional)',
        lastName: 'string (optional)',
      },
      example: {
        email: 'user@example.com',
        password: 'UserPass123!',
        firstName: 'John',
        lastName: 'Doe',
      },
    },
    responses: [
      {
        status: 201,
        description: 'User created',
        example: {
          success: true,
          data: {
            id: 'user-id',
            email: 'user@example.com',
            displayName: 'John Doe',
          },
          message: 'User created successfully',
        },
      },
    ],
  },

  // OAuth
  {
    method: 'GET',
    path: '/api/auth/:projectId/oauth/:provider',
    title: 'Get OAuth Authorization URL',
    description: 'Get the OAuth authorization URL for a provider',
    category: 'OAuth',
    authentication: 'None',
    responses: [
      {
        status: 200,
        description: 'OAuth URL generated',
        example: {
          success: true,
          data: {
            authUrl: 'https://oauth-provider.com/authorize?...',
            state: 'csrf_state_token',
          },
        },
      },
    ],
  },
  {
    method: 'GET',
    path: '/api/auth/:projectId/oauth/:provider/callback',
    title: 'OAuth Callback',
    description: 'Handle OAuth provider callback',
    category: 'OAuth',
    authentication: 'None',
    responses: [
      {
        status: 200,
        description: 'OAuth authentication successful',
        example: {
          success: true,
          data: {
            user: {
              id: 'user-id',
              email: 'user@example.com',
              displayName: 'John Doe',
            },
            accessToken: 'jwt_access_token',
            refreshToken: 'refresh_token',
          },
        },
      },
    ],
  },

  // Health Check
  {
    method: 'GET',
    path: '/health',
    title: 'Health Check',
    description: 'Check if the service is running',
    category: 'System',
    authentication: 'None',
    responses: [
      {
        status: 200,
        description: 'Service is healthy',
        example: {
          status: 'ok',
          service: 'auth',
          timestamp: '2025-11-03T12:00:00Z',
        },
      },
    ],
  },
];

// Generate Postman Collection
export function generatePostmanCollection(baseUrl: string = 'https://auth.example.com') {
  const collection = {
    info: {
      name: 'Auth Service API',
      description: 'Complete API collection for multi-project authentication service',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      {
        key: 'baseUrl',
        value: baseUrl,
        type: 'string',
      },
      {
        key: 'adminSession',
        value: '',
        type: 'string',
      },
      {
        key: 'accessToken',
        value: '',
        type: 'string',
      },
      {
        key: 'projectId',
        value: 'your-project-id',
        type: 'string',
      },
    ],
    item: [] as any[],
  };

  // Group endpoints by category
  const categories = Array.from(new Set(apiEndpoints.map(e => e.category)));

  categories.forEach(category => {
    const categoryEndpoints = apiEndpoints.filter(e => e.category === category);

    collection.item.push({
      name: category,
      item: categoryEndpoints.map(endpoint => ({
        name: endpoint.title,
        request: {
          method: endpoint.method,
          header: [
            {
              key: 'Content-Type',
              value: 'application/json',
              type: 'text',
            },
            ...(endpoint.headers ? Object.entries(endpoint.headers).map(([key, value]) => ({
              key,
              value: value.includes('session') ? '{{adminSession}}' : value.includes('token') ? '{{accessToken}}' : value,
              type: 'text',
            })) : []),
          ],
          body: endpoint.requestBody ? {
            mode: 'raw',
            raw: JSON.stringify(endpoint.requestBody.example, null, 2),
            options: {
              raw: {
                language: 'json',
              },
            },
          } : undefined,
          url: {
            raw: `{{baseUrl}}${endpoint.path.replace(':projectId', '{{projectId}}')}`,
            host: ['{{baseUrl}}'],
            path: endpoint.path.split('/').filter(Boolean).map(p =>
              p.startsWith(':') ? `{{${p.slice(1)}}}` : p
            ),
          },
          description: endpoint.description,
        },
        response: endpoint.responses.map(resp => ({
          name: resp.description,
          originalRequest: {
            method: endpoint.method,
            header: [],
            url: {
              raw: `{{baseUrl}}${endpoint.path}`,
            },
          },
          status: resp.description,
          code: resp.status,
          _postman_previewlanguage: 'json',
          header: [
            {
              key: 'Content-Type',
              value: 'application/json',
            },
          ],
          cookie: [],
          body: JSON.stringify(resp.example, null, 2),
        })),
      })),
    });
  });

  return collection;
}