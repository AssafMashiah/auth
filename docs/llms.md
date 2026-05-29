
----------------------------------------
TITLE: Trigger Password Reset
DESCRIPTION: Step 1 of 2. Initiate a password reset flow by sending an email with a reset link.
```typescript
// POST /api/auth/:projectId/forgot-password
// Requires: Valid projectId
const response = await fetch('https://your-worker.com/api/auth/PROJECT_ID/forgot-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com'
  })
});

// Always returns success: true to prevent email enumeration
const result = await response.json();
// result: { success: true, message: "If an account exists..." }
```
----------------------------------------

----------------------------------------
TITLE: Complete Password Reset
DESCRIPTION: Step 2 of 2. Use the token from the email to set a new password.
```typescript
// POST /api/auth/:projectId/reset-password
// Requires: Token from email link
const response = await fetch('https://your-worker.com/api/auth/PROJECT_ID/reset-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: "TOKEN_FROM_EMAIL_URL",
    newPassword: "NewSecurePassword123!"
  })
});

const result = await response.json();
if (result.success) {
  // Password changed. User must now login with new password.
}
```
----------------------------------------

----------------------------------------
TITLE: Retrieve Audit Logs
DESCRIPTION: Fetch audit logs via Admin API. Supports filtering by project, event type, and pagination.
```typescript
// GET /api/admin/audit-logs
// Headers: { 'X-Admin-Session': '...' }
const params = new URLSearchParams({
  projectId: 'optional-project-id',
  eventType: 'user_login', // optional
  limit: '50',
  offset: '0'
});

const response = await fetch(`https://your-worker.com/api/admin/audit-logs?${params}`, {
  headers: { 'X-Admin-Session': sessionToken }
});

const { data } = await response.json();
/* Response shape:
data: [{
  id: string,
  projectId: string | null,
  eventType: string, // e.g., 'user_login', 'project_created'
  eventStatus: 'success' | 'failure' | 'warning',
  userId: string | null,
  adminUserId: string | null,
  ipAddress: string | null,
  userAgent: string | null,
  eventData: string | null, // JSON string
  createdAt: string
}]
*/
```
----------------------------------------

----------------------------------------
TITLE: Update User via Admin API
DESCRIPTION: Admin endpoint to update user details, verify email/phone, or ban users.
```typescript
// PUT /api/admin/projects/:projectId/users/:userId
// Headers: { 'X-Admin-Session': '...' }
const response = await fetch('https://your-worker.com/api/admin/projects/PROJECT_ID/users/USER_ID', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Session': sessionToken
  },
  body: JSON.stringify({
    displayName: 'New Name',
    email: 'new@example.com',
    emailVerified: true,
    phoneVerified: true,
    status: 'suspended', // 'active' | 'suspended' | 'deleted'
    metadata: JSON.stringify({ role: 'editor' })
  })
});

const { data: updatedUser } = await response.json();
```
----------------------------------------

----------------------------------------
TITLE: Configure Global Rate Limits
DESCRIPTION: Set default rate limits for all projects via System Settings.
```typescript
// PUT /api/admin/settings
// Headers: { 'X-Admin-Session': '...' }
// NOTE: This sets GLOBAL defaults. Per-endpoint configuration is [NOT EXPOSED VIA API].
const response = await fetch('https://your-worker.com/api/admin/settings', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Session': sessionToken
  },
  body: JSON.stringify({
    defaultRateLimitWindow: 60, // seconds
    defaultRateLimitMax: 5      // attempts per window
  })
});
```
----------------------------------------

----------------------------------------
TITLE: Configure OAuth Provider
DESCRIPTION: Enable an OAuth provider (Google, GitHub, Microsoft, Apple) for a specific project.
```typescript
// POST /api/admin/projects/:projectId/oauth
// Headers: { 'X-Admin-Session': '...' }
const response = await fetch('https://your-worker.com/api/admin/projects/PROJECT_ID/oauth', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Session': sessionToken
  },
  body: JSON.stringify({
    providerName: 'google', // google, github, microsoft, apple, custom
    clientId: 'YOUR_GOOGLE_CLIENT_ID',
    clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET',
    scopes: ['email', 'profile'],
    enabled: true
  })
});
```
----------------------------------------

----------------------------------------
TITLE: Get OAuth Authorization URL
DESCRIPTION: Start the OAuth flow by fetching the provider's redirect URL.
```typescript
// GET /api/auth/:projectId/oauth/:provider
const params = new URLSearchParams({
  redirect_uri: 'https://your-app.com/callback',
  state: 'random-secure-string'
});

const response = await fetch(`https://your-worker.com/api/auth/PROJECT_ID/oauth/google?${params}`);
const { data } = await response.json();

// Redirect the user's browser to this URL
// window.location.href = data.authUrl;
```
----------------------------------------

----------------------------------------
TITLE: Handle OAuth Callback
DESCRIPTION: Exchange the provider's code for access/refresh tokens.
```typescript
// GET /api/auth/:projectId/oauth/:provider/callback
const params = new URLSearchParams({
  code: 'CODE_FROM_PROVIDER',
  redirect_uri: 'https://your-app.com/callback' // Must match the one used in step 1
});

const response = await fetch(`https://your-worker.com/api/auth/PROJECT_ID/oauth/google/callback?${params}`);
const { data } = await response.json();

// data: {
//   user: { id, email, ... },
//   accessToken: "...",
//   refreshToken: "..."
// }
```
----------------------------------------

----------------------------------------
TITLE: Configure Email Provider
DESCRIPTION: Configure SendGrid or other providers for sending system emails.
```typescript
// POST /api/admin/email-providers
// Headers: { 'X-Admin-Session': '...' }
const response = await fetch('https://your-worker.com/api/admin/email-providers', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Session': sessionToken
  },
  body: JSON.stringify({
    name: 'Primary SendGrid',
    provider: 'sendgrid', // sendgrid, mailgun, postmark, resend, smtp
    type: 'api',
    fromEmail: 'noreply@your-app.com',
    fromName: 'Auth Service',
    isDefault: true,
    config: {
      apiKey: 'SG.your_api_key_here'
    }
  })
});
```
----------------------------------------

----------------------------------------
TITLE: Customize Email Templates
DESCRIPTION: Update the HTML/Text content for system emails (confirmation, password reset, welcome).
```typescript
// PUT /api/admin/email-templates/:type
// Type: confirmation | password_reset | welcome
const response = await fetch('https://your-worker.com/api/admin/email-templates/confirmation', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Session': sessionToken
  },
  body: JSON.stringify({
    subject: 'Confirm your account for {{project_name}}',
    bodyHtml: '<h1>Welcome!</h1><p>Click here: <a href="{{confirmation_url}}">Confirm Email</a></p>',
    bodyText: 'Welcome! Confirm here: {{confirmation_url}}'
  })
});
```
----------------------------------------

----------------------------------------
TITLE: RBAC - Decode JWT and Check Role
DESCRIPTION: Decode the JWT on the client to check authentication state.
```typescript
// NOTE: JWT does not include a role claim by default.
// Implement RBAC by storing roles in your app DB and looking them up by user.id,
// or by adding custom claims to the token generation logic if modifying the source.

function decodeToken(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// Usage
const token = "ey...";
const payload = decodeToken(token);

if (payload) {
  console.log("User ID:", payload.sub);
  console.log("Email:", payload.email);
  console.log("Project:", payload.projectId);
  console.log("Expires:", new Date(payload.exp * 1000));
}
```
----------------------------------------

----------------------------------------
TITLE: Architecture Reference
DESCRIPTION: High-level system architecture overview.
```typescript
/**
 * ARCHITECTURE: Cloudflare Auth Service
 *
 * Runtime: Cloudflare Workers (V8 isolates, ~0ms cold start, global edge PoPs)
 * Database: Cloudflare D1 (SQLite at edge, eventually consistent reads)
 *
 * Multi-project isolation:
 *   Each project gets a dedicated user table: users_{projectId}
 *   JWT secrets are per-project and auto-generated on project creation
 *
 * Token model:
 *   accessToken  — short-lived JWT (default: 1h), signed with project JWT secret
 *   refreshToken — long-lived opaque token stored in D1, rotated on use
 *
 * Eventual consistency gotcha:
 *   D1 writes are not immediately visible on subsequent reads in the same request.
 *   Do not read-after-write within the same Worker invocation.
 *
 * Data residency:
 *   Free tier: Cloudflare selects D1 region automatically
 *   Paid tier: D1 supports location hints for regional data pinning
 *
 * Scaling: Workers scale horizontally by default. D1 scales to 10GB per database.
 *   For >10GB user data, partition by creating additional D1 databases per project group.
 */
```
----------------------------------------
