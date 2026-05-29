// API client for auth service

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private sessionToken: string | null = null;
  private onSessionExpired?: () => void;

  setSessionToken(token: string | null) {
    this.sessionToken = token;
    if (token) {
      localStorage.setItem('admin_session', token);
    } else {
      localStorage.removeItem('admin_session');
    }
  }

  getSessionToken(): string | null {
    if (!this.sessionToken) {
      this.sessionToken = localStorage.getItem('admin_session');
    }
    return this.sessionToken;
  }

  setSessionExpiredHandler(handler: () => void) {
    this.onSessionExpired = handler;
  }

  private handleAuthError() {
    this.setSessionToken(null);
    if (this.onSessionExpired) {
      this.onSessionExpired();
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getSessionToken();
    if (token) {
      headers['X-Admin-Session'] = token;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle authentication errors (401, 403) or session-related errors
      if (response.status === 401 || response.status === 403 ||
          (data.error && (data.error.includes('session') || data.error.includes('Invalid session')))) {
        this.handleAuthError();
      }
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  // Admin Auth
  async login(email: string, password: string) {
    const result = await this.request<{ sessionToken: string; admin: any; requiresSetup?: boolean }>(
      '/admin/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );

    if (result.data?.sessionToken) {
      this.setSessionToken(result.data.sessionToken);
    }

    return result;
  }

  async logout() {
    try {
      await this.request('/admin/logout', { method: 'POST' });
    } catch (error) {
      // Ignore errors during logout (session may already be invalid)
      console.log('Logout request failed, clearing session anyway');
    } finally {
      this.setSessionToken(null);
    }
  }

  // Projects
  async getProjects(filters?: { environment?: string; enabled?: boolean }) {
    const params = new URLSearchParams();
    if (filters?.environment) params.append('environment', filters.environment);
    if (filters?.enabled !== undefined) params.append('enabled', String(filters.enabled));

    const query = params.toString();
    return this.request<any[]>(`/admin/projects${query ? `?${query}` : ''}`);
  }

  async getProject(id: string) {
    return this.request<any>(`/admin/projects/${id}`);
  }

  async createProject(data: {
    name: string;
    description?: string;
    environment?: string;
    environments?: string[];
    siteUrl?: string;
    redirectUrls?: string[];
  }) {
    return this.request<any>('/admin/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: string, data: Partial<{
    name: string;
    description: string;
    jwtExpiryMinutes: number;
    enabled: boolean;
    siteUrl: string;
    redirectUrls: string[];
  }>) {
    return this.request<any>(`/admin/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string) {
    return this.request<void>(`/admin/projects/${id}`, {
      method: 'DELETE',
    });
  }

  // Users
  async getProjectUsers(projectId: string, filters?: {
    limit?: number;
    offset?: number;
    search?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));
    if (filters?.search) params.append('search', filters.search);

    const query = params.toString();
    return this.request<any[]>(`/admin/projects/${projectId}/users${query ? `?${query}` : ''}`);
  }

  async createProjectUser(projectId: string, data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    return this.request<any>(`/admin/projects/${projectId}/users`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteProjectUser(projectId: string, userId: string) {
    return this.request<void>(`/admin/projects/${projectId}/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async updateProjectUser(projectId: string, userId: string, data: {
    email?: string;
    displayName?: string;
    status?: string;
    emailVerified?: boolean;
    password?: string;
  }) {
    return this.request<any>(`/admin/projects/${projectId}/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async resendVerificationEmail(projectId: string, userId: string) {
    return this.request<{ message: string }>(`/admin/projects/${projectId}/users/${userId}/resend-verification`, {
      method: 'POST',
    });
  }

  // OAuth
  async getOAuthProviders(projectId: string) {
    return this.request<any[]>(`/admin/projects/${projectId}/oauth`);
  }

  async configureOAuth(projectId: string, data: {
    providerName: string;
    clientId: string;
    clientSecret: string;
    enabled: boolean;
  }) {
    return this.request<any>(`/admin/projects/${projectId}/oauth`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateOAuthProvider(projectId: string, providerId: string, data: Partial<any>) {
    return this.request<any>(`/admin/projects/${projectId}/oauth/${providerId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteOAuthProvider(projectId: string, providerId: string) {
    return this.request<void>(`/admin/projects/${projectId}/oauth/${providerId}`, {
      method: 'DELETE',
    });
  }

  // Admin Users
  async getAdminUsers() {
    return this.request<any[]>('/admin/users');
  }

  async createAdminUser(data: {
    email: string;
    password: string;
    displayName: string;
    role: string;
  }) {
    return this.request<any>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAdminUser(id: string, data: Partial<any>) {
    return this.request<any>(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async changeAdminPassword(id: string, data: any) {
    return this.request<any>(`/admin/users/${id}/change-password`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteAdminUser(id: string) {
    return this.request<void>(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  // Audit Logs
  async getAuditLogs(filters?: {
    projectId?: string;
    eventType?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams();
    if (filters?.projectId) params.append('projectId', filters.projectId);
    if (filters?.eventType) params.append('eventType', filters.eventType);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));

    const query = params.toString();
    return this.request<any[]>(`/admin/audit-logs${query ? `?${query}` : ''}`);
  }

  // Supabase Import
  async validateSupabaseConnection(projectId: string, supabaseUrl: string, supabaseServiceKey: string) {
    return this.request<{ userCount?: number }>(`/admin/projects/${projectId}/import-supabase/validate`, {
      method: 'POST',
      body: JSON.stringify({ supabaseUrl, supabaseServiceKey }),
    });
  }

  async getSupabaseImportPreview(projectId: string, supabaseUrl: string, supabaseServiceKey: string, limit?: number) {
    return this.request<{
      totalCount: number;
      sampleUsers: Array<{
        email: string;
        displayName: string | null;
        hasPassword: boolean;
        hasOAuth: boolean;
        createdAt: string;
      }>;
    }>(`/admin/projects/${projectId}/import-supabase/preview`, {
      method: 'POST',
      body: JSON.stringify({ supabaseUrl, supabaseServiceKey, limit }),
    });
  }

  async importFromSupabase(projectId: string, data: {
    supabaseUrl: string;
    supabaseServiceKey: string;
    options?: {
      batchSize?: number;
      skipExisting?: boolean;
      preserveIds?: boolean;
      importMetadata?: boolean;
      preserveOAuth?: boolean;
    };
  }) {
    return this.request<{
      totalUsers: number;
      imported: number;
      failed: number;
      skipped: number;
      errors: Array<{
        email: string;
        reason: string;
      }>;
    }>(`/admin/projects/${projectId}/import-supabase`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Settings
  async getSettings() {
    return this.request('/admin/settings');
  }

  async updateSettings(data: any) {
    return this.request('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Email Providers
  async getEmailProviders() {
    return this.request('/admin/email-providers');
  }

  async createEmailProvider(data: any) {
    return this.request('/admin/email-providers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateEmailProvider(id: string, data: any) {
    return this.request(`/admin/email-providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteEmailProvider(id: string) {
    return this.request(`/admin/email-providers/${id}`, {
      method: 'DELETE',
    });
  }

  // Email Templates
  async getEmailTemplates() {
    return this.request('/admin/email-templates');
  }

  async getProjectEmailTemplates(projectId: string) {
    return this.request(`/admin/projects/${projectId}/email-templates`);
  }

  async updateEmailTemplate(type: string, data: any) {
    return this.request(`/admin/email-templates/${type}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateProjectEmailTemplate(projectId: string, type: string, data: any) {
    return this.request(`/admin/projects/${projectId}/email-templates/${type}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProjectEmailTemplate(projectId: string, id: string) {
    return this.request(`/admin/projects/${projectId}/email-templates/${id}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient();