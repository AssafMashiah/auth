import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface Project {
  id: string;
  name: string;
  description: string;
  environment: string;
  enabled: boolean;
  jwtSecret: string;
  jwtExpiryMinutes: number;
  userTableName: string;
  siteUrl?: string;
  redirectUrls?: string[];
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  email: string;
  display_name?: string;
  email_verified?: number;
  status?: string;
  created_at?: string;
  // Legacy fields
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  enabled?: boolean;
  createdAt?: string;
}

interface OAuthProvider {
  id: string;
  providerName: string;
  clientId: string;
  enabled: boolean;
  createdAt: string;
}

interface AuditLog {
  id: string;
  eventType: string;
  status: string;
  userId?: string;
  ipAddress?: string;
  createdAt: string;
}

type Tab = 'overview' | 'users' | 'oauth' | 'audit' | 'templates';

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [jwtExpiryMinutes, setJwtExpiryMinutes] = useState(60);
  const [enabled, setEnabled] = useState(true);
  const [siteUrl, setSiteUrl] = useState('');
  const [redirectUrls, setRedirectUrls] = useState('');

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    try {
      setLoading(true);
      const response = await api.getProject(id!);
      const proj = response.data;
      setProject(proj);
      setName(proj.name);
      setDescription(proj.description || '');
      setJwtExpiryMinutes(proj.jwtExpiryMinutes || 60);
      setEnabled(proj.enabled);
      setSiteUrl(proj.siteUrl || '');
      setRedirectUrls(proj.redirectUrls?.join('\n') || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');

      // Parse redirect URLs from textarea (one per line)
      const redirectUrlsArray = redirectUrls
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

      await api.updateProject(id!, {
        name,
        description,
        jwtExpiryMinutes,
        enabled,
        siteUrl: siteUrl.trim() || undefined,
        redirectUrls: redirectUrlsArray.length > 0 ? redirectUrlsArray : undefined,
      });
      await loadProject();
      alert('Project updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  const copySecret = () => {
    if (project?.jwtSecret) {
      navigator.clipboard.writeText(project.jwtSecret);
      alert('JWT Secret copied to clipboard');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-secondary">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="card">
        <div className="text-danger">Project not found</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">{project.name}</h1>
        <p className="text-text-secondary mt-1">{project.description || 'No description'}</p>
      </div>

      {error && (
        <div className="bg-danger-bg border border-danger/20 text-danger-text px-4 py-3 rounded-md mb-6">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'users', label: 'Users' },
            { id: 'templates', label: 'Templates' },
            { id: 'oauth', label: 'OAuth Providers' },
            { id: 'audit', label: 'Audit Logs' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          project={project}
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          jwtExpiryMinutes={jwtExpiryMinutes}
          setJwtExpiryMinutes={setJwtExpiryMinutes}
          enabled={enabled}
          setEnabled={setEnabled}
          siteUrl={siteUrl}
          setSiteUrl={setSiteUrl}
          redirectUrls={redirectUrls}
          setRedirectUrls={setRedirectUrls}
          showSecret={showSecret}
          setShowSecret={setShowSecret}
          copySecret={copySecret}
          handleSave={handleSave}
          saving={saving}
        />
      )}
      {activeTab === 'users' && <UsersTab projectId={id!} />}
      {activeTab === 'templates' && <TemplatesTab projectId={id!} />}
      {activeTab === 'oauth' && <OAuthTab projectId={id!} />}
      {activeTab === 'audit' && <AuditTab projectId={id!} />}
    </div>
  );
}

function TemplatesTab({ projectId }: { projectId: string }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState('welcome');
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [projectId]);

  const loadTemplates = async () => {
    try {
        const res = await api.getProjectEmailTemplates(projectId);
        if (res.success) setTemplates(res.data as any[]);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
      // Find template for type, or create empty/default one
      const tmpl = templates.find(t => t.type === selectedType);

      if (tmpl) {
          setEditingTemplate(tmpl);
      } else {
          // Reset to empty state indicating "Using System Default"
          setEditingTemplate({
              type: selectedType,
              subject: '',
              bodyHtml: '',
              bodyText: '',
              isNew: true // Marker
          });
      }
  }, [selectedType, templates]);

  const handleSave = async () => {
      if (!editingTemplate) return;
      setLoading(true);
      try {
          await api.updateProjectEmailTemplate(projectId, selectedType, {
              subject: editingTemplate.subject,
              bodyHtml: editingTemplate.bodyHtml,
              bodyText: editingTemplate.bodyText
          });
          await loadTemplates();
          alert('Template saved');
      } catch (e) {
          alert('Failed to save');
      } finally {
          setLoading(false);
      }
  };

  const handleReset = async () => {
      if (!editingTemplate || editingTemplate.isNew) return;
      if (!confirm('Revert to system default?')) return;
      setLoading(true);
      try {
          await api.deleteProjectEmailTemplate(projectId, editingTemplate.id);
          await loadTemplates();
      } catch (e) {
          alert('Failed to reset');
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-[600px]">
      <div className="col-span-3 border-r border-border pr-4">
        <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">Templates</h3>
        <div className="space-y-1">
          {['welcome', 'confirmation', 'password_reset', 'magic_link', 'email_change', 'otp'].map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                selectedType === type
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-text-secondary hover:bg-hover hover:text-text-primary'
              }`}
            >
              {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      <div className="col-span-9 flex flex-col h-full">
        {editingTemplate && (
          <div className="flex flex-col h-full space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-text-primary">
                    {selectedType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    {editingTemplate.isNew ? <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">System Default</span> : <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">Project Override</span>}
                </h3>
                {!editingTemplate.isNew && (
                    <button onClick={handleReset} className="text-sm text-red-600 hover:text-red-700">Revert to Default</button>
                )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Subject</label>
              <input
                type="text"
                className="input w-full"
                value={editingTemplate.subject}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                placeholder="Subject line..."
              />
            </div>

            <div className="flex-1 flex flex-col">
              <label className="block text-sm font-medium text-text-secondary mb-1">HTML Content</label>
              <textarea
                className="input w-full flex-1 font-mono text-sm"
                value={editingTemplate.bodyHtml}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, bodyHtml: e.target.value })}
                placeholder="<html>...</html>"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <p className="text-xs text-text-secondary">
                Variables: {`{{project_name}}, {{action_url}}, {{user_email}}`}
              </p>
              <button onClick={handleSave} disabled={loading} className="btn btn-primary">
                {loading ? 'Saving...' : 'Save Override'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  project,
  name,
  setName,
  description,
  setDescription,
  jwtExpiryMinutes,
  setJwtExpiryMinutes,
  enabled,
  setEnabled,
  siteUrl,
  setSiteUrl,
  redirectUrls,
  setRedirectUrls,
  showSecret,
  setShowSecret,
  copySecret,
  handleSave,
  saving,
}: any) {
  return (
    <div className="card space-y-6 p-6">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Project Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input"
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Environment
        </label>
        <input
          type="text"
          value={project.environment}
          className="input bg-surface-hover"
          disabled
        />
        <p className="text-xs text-text-secondary mt-1">Environment cannot be changed</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          JWT Secret
        </label>
        <div className="flex items-center space-x-2">
          <input
            type={showSecret ? 'text' : 'password'}
            value={project.jwtSecret}
            className="input bg-surface-hover flex-1"
            disabled
          />
          <button
            onClick={() => setShowSecret(!showSecret)}
            className="btn btn-secondary"
          >
            {showSecret ? 'Hide' : 'Show'}
          </button>
          <button onClick={copySecret} className="btn btn-secondary">
            Copy
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          JWT Expiry (minutes)
        </label>
        <input
          type="number"
          value={jwtExpiryMinutes}
          onChange={(e) => setJwtExpiryMinutes(parseInt(e.target.value))}
          className="input"
          min="1"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Site URL
        </label>
        <input
          type="url"
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          className="input"
          placeholder="https://myapp.com"
        />
        <p className="text-xs text-text-secondary mt-1">
          Main site URL used for email callback links (leave empty if not using email features)
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Redirect URLs
        </label>
        <textarea
          value={redirectUrls}
          onChange={(e) => setRedirectUrls(e.target.value)}
          className="input"
          rows={3}
          placeholder="https://myapp.com/auth/callback&#10;https://myapp.com/verify-email"
        />
        <p className="text-xs text-text-secondary mt-1">
          Allowed callback URLs for email verification and password reset (one per line)
        </p>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
        />
        <label htmlFor="enabled" className="ml-2 block text-sm text-text-primary">
          Project Enabled
        </label>
      </div>

      <div className="pt-4 border-t border-border">
        <div className="text-sm text-text-secondary space-y-1">
          <p>
            <span className="font-medium">Created:</span>{' '}
            {new Date(project.createdAt).toLocaleString()}
          </p>
          <p>
            <span className="font-medium">Updated:</span>{' '}
            {new Date(project.updatedAt).toLocaleString()}
          </p>
          <p>
            <span className="font-medium">User Table:</span>{' '}
            <code className="text-xs">{project.userTableName}</code>
          </p>
        </div>
      </div>

      <div className="pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function UsersTab({ projectId }: { projectId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const pageSize = 10;

  useEffect(() => {
    loadUsers();
  }, [projectId, search, page]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await api.getProjectUsers(projectId, {
        limit: pageSize,
        offset: page * pageSize,
        search,
      });
      setUsers(response.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}?`)) return;
    try {
      await api.deleteProjectUser(projectId, userId);
      await loadUsers();
    } catch (err) {
      alert('Failed to delete user');
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setShowEditModal(true);
  };

  const handleResendVerification = async (userId: string, email: string, emailVerified: boolean) => {
    if (emailVerified) {
      alert('This email is already verified');
      return;
    }

    if (!confirm(`Send verification email to ${email}?`)) return;

    try {
      setResendingEmail(userId);
      await api.resendVerificationEmail(projectId, userId);
      alert('Verification email sent successfully');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send verification email');
    } finally {
      setResendingEmail(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <input
          type="text"
          placeholder="Search by email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="input max-w-sm"
        />
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="btn btn-secondary"
          >
            Import from Supabase
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            Create User
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-secondary">Loading users...</div>
      ) : (
        <>
          <div className="card p-0 overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Display Name</th>
                  <th>Status</th>
                  <th>Email Verified</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-text-inactive py-8">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td className="text-text-primary">{user.email}</td>
                      <td className="text-text-secondary">{user.display_name || '-'}</td>
                      <td>
                        <span
                          className={`badge ${
                            user.status === 'active'
                              ? 'badge-success'
                              : user.status === 'suspended'
                              ? 'badge-warning'
                              : 'badge-neutral'
                          }`}
                        >
                          {user.status || 'active'}
                        </span>
                      </td>
                      <td>
                        {user.email_verified ? (
                          <span className="text-success">✓</span>
                        ) : (
                          <span className="text-text-inactive">✗</span>
                        )}
                      </td>
                      <td className="text-text-secondary">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                      </td>
                      <td>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleEdit(user)}
                            className="text-primary hover:underline text-sm font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleResendVerification(user.id, user.email, !!user.email_verified)}
                            disabled={resendingEmail === user.id || !!user.email_verified}
                            className={`text-sm font-medium ${
                              user.email_verified
                                ? 'text-text-inactive cursor-not-allowed'
                                : resendingEmail === user.id
                                ? 'text-text-inactive cursor-wait'
                                : 'text-info hover:underline'
                            }`}
                            title={user.email_verified ? 'Email already verified' : 'Resend verification email'}
                          >
                            {resendingEmail === user.id ? 'Sending...' : 'Resend'}
                          </button>
                          <button
                            onClick={() => handleDelete(user.id, user.email)}
                            className="text-danger hover:underline text-sm font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {users.length >= pageSize && (
            <div className="flex items-center justify-center space-x-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="btn btn-secondary disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-text-secondary">Page {page + 1}</span>
              <button
                onClick={() => setPage(page + 1)}
                className="btn btn-secondary"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {showCreateModal && (
        <CreateUserModal
          projectId={projectId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadUsers();
          }}
        />
      )}

      {showEditModal && editingUser && (
        <EditUserModal
          projectId={projectId}
          user={editingUser}
          onClose={() => {
            setShowEditModal(false);
            setEditingUser(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditingUser(null);
            loadUsers();
          }}
        />
      )}

      {showImportModal && (
        <SupabaseImportModal
          projectId={projectId}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

function SupabaseImportModal({
  projectId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<'credentials' | 'preview' | 'importing' | 'results'>('credentials');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseServiceKey, setSupabaseServiceKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [options, setOptions] = useState({
    batchSize: 100,
    skipExisting: true,
    preserveIds: false,
    importMetadata: true,
    preserveOAuth: true,
  });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleValidate = async () => {
    try {
      setValidating(true);
      setError('');

      const validationResponse = await api.validateSupabaseConnection(
        projectId,
        supabaseUrl,
        supabaseServiceKey
      );

      if (!validationResponse.success) {
        throw new Error(validationResponse.error || 'Invalid credentials');
      }

      const previewResponse = await api.getSupabaseImportPreview(
        projectId,
        supabaseUrl,
        supabaseServiceKey,
        5
      );

      setPreview(previewResponse.data);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      setError('');
      setStep('importing');

      const response = await api.importFromSupabase(projectId, {
        supabaseUrl,
        supabaseServiceKey,
        options,
      });

      setResult(response.data);
      setStep('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    } finally {
      setImporting(false);
    }
  };

  const downloadErrorReport = () => {
    if (!result || !result.errors || result.errors.length === 0) return;

    const csv = [
      ['Email', 'Reason'],
      ...result.errors.map((e: any) => [e.email, e.reason]),
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-xl font-bold text-text-primary mb-4">
          Import Users from Supabase
        </h2>

        {error && (
          <div className="bg-danger-bg border border-danger/20 text-danger-text px-4 py-3 rounded-md text-sm mb-4">
            {error}
          </div>
        )}

        {/* Step 1: Credentials */}
        {step === 'credentials' && (
          <div className="space-y-4">
            <div className="bg-warning-bg border border-warning/20 px-4 py-3 rounded-md">
              <p className="text-sm text-warning-text">
                <strong>⚠️ Important:</strong> Supabase Admin API does not expose password hashes for security reasons.
                Imported users will need to reset their passwords via email after migration.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Supabase Project URL *
              </label>
              <input
                type="url"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://xxxxx.supabase.co"
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Service Role Key *
              </label>
              <input
                type="password"
                value={supabaseServiceKey}
                onChange={(e) => setSupabaseServiceKey(e.target.value)}
                placeholder="eyJhbGc..."
                className="input"
                required
              />
              <p className="text-xs text-text-inactive mt-1">
                Found in Supabase Dashboard → Settings → API → service_role key
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleValidate}
                disabled={validating || !supabaseUrl || !supabaseServiceKey}
                className="btn btn-primary disabled:opacity-50"
              >
                {validating ? 'Validating...' : 'Test Connection'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div className="bg-info-bg border border-info/20 px-4 py-3 rounded-md">
              <p className="text-sm text-info-text">
                <strong>Connection successful!</strong> Found {preview.totalCount} users to import.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-text-primary mb-2">Sample Users (First 5)</h3>
              <div className="border border-border rounded-md overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-hover">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Password</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">OAuth</th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface divide-y divide-border">
                    {preview.sampleUsers.map((user: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 text-sm text-text-primary">{user.email}</td>
                        <td className="px-4 py-2 text-sm text-text-secondary">{user.displayName || '-'}</td>
                        <td className="px-4 py-2 text-sm">
                          {user.hasPassword ? (
                            <span className="text-success">✓</span>
                          ) : (
                            <span className="text-text-inactive">✗</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {user.hasOAuth ? (
                            <span className="text-success">✓</span>
                          ) : (
                            <span className="text-text-inactive">✗</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-text-primary mb-3">Import Options</h3>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={options.skipExisting}
                    onChange={(e) => setOptions({ ...options, skipExisting: e.target.checked })}
                    className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
                  />
                  <span className="ml-2 text-sm text-text-secondary">Skip existing users (by email)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={options.preserveIds}
                    onChange={(e) => setOptions({ ...options, preserveIds: e.target.checked })}
                    className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
                  />
                  <span className="ml-2 text-sm text-text-secondary">Preserve user IDs</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={options.importMetadata}
                    onChange={(e) => setOptions({ ...options, importMetadata: e.target.checked })}
                    className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
                  />
                  <span className="ml-2 text-sm text-text-secondary">Import user metadata</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={options.preserveOAuth}
                    onChange={(e) => setOptions({ ...options, preserveOAuth: e.target.checked })}
                    className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
                  />
                  <span className="ml-2 text-sm text-text-secondary">Preserve OAuth connections</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setStep('credentials')}
                className="btn btn-secondary"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="btn btn-primary disabled:opacity-50"
              >
                Start Import
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <div className="space-y-4 text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h3 className="text-lg font-medium text-text-primary">Importing Users...</h3>
            <p className="text-sm text-text-secondary">
              This may take a few moments. Please don't close this window.
            </p>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 'results' && result && (
          <div className="space-y-4">
            <div className="bg-success-bg border border-success/20 px-4 py-3 rounded-md">
              <p className="text-sm text-success-text">
                <strong>Import completed!</strong>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border border-border rounded-md p-4">
                <div className="text-2xl font-bold text-text-primary">{result.imported}</div>
                <div className="text-sm text-text-secondary">Successfully Imported</div>
              </div>
              <div className="border border-border rounded-md p-4">
                <div className="text-2xl font-bold text-text-primary">{result.totalUsers}</div>
                <div className="text-sm text-text-secondary">Total Users</div>
              </div>
              <div className="border border-border rounded-md p-4">
                <div className="text-2xl font-bold text-warning-text">{result.skipped}</div>
                <div className="text-sm text-text-secondary">Skipped</div>
              </div>
              <div className="border border-border rounded-md p-4">
                <div className="text-2xl font-bold text-danger-text">{result.failed}</div>
                <div className="text-sm text-text-secondary">Failed</div>
              </div>
            </div>

            {result.errors && result.errors.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-text-primary">
                    Failed Imports ({result.errors.length})
                  </h3>
                  <button
                    onClick={downloadErrorReport}
                    className="text-sm text-primary hover:underline"
                  >
                    Download Error Report
                  </button>
                </div>
                <div className="border border-border rounded-md max-h-40 overflow-y-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-table-header-bg">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Email</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-text-secondary">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                      {result.errors.slice(0, 10).map((error: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm text-text-primary">{error.email}</td>
                          <td className="px-4 py-2 text-sm text-danger-text">{error.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.errors.length > 10 && (
                  <p className="text-xs text-text-secondary mt-2">
                    Showing first 10 errors. Download report for full list.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
              <button onClick={onClose} className="btn-secondary">
                Close
              </button>
              <button onClick={onSuccess} className="btn-primary">
                View Imported Users
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateUserModal({
  projectId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      await api.createProjectUser(projectId, {
        email,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-text-primary mb-4">Create User</h2>
        {error && (
          <div className="bg-danger-bg border border-danger/20 text-danger-text px-4 py-3 rounded-md text-sm mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Password *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="input"
            />
          </div>
          <div className="flex items-center justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({
  projectId,
  user,
  onClose,
  onSuccess,
}: {
  projectId: string;
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState(user.email);
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [status, setStatus] = useState(user.status || 'active');
  const [emailVerified, setEmailVerified] = useState(!!user.email_verified);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');

      const updates: any = {
        email,
        displayName,
        status,
        emailVerified,
      };

      // Only update password if provided
      if (password.trim()) {
        updates.password = password;
      }

      await api.updateProjectUser(projectId, user.id, updates);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-text-primary mb-4">Edit User</h2>
        {error && (
          <div className="bg-danger-bg border border-danger/20 text-danger-text px-4 py-3 rounded-md text-sm mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Status *
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input"
              required
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="deleted">Deleted</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="emailVerified"
              checked={emailVerified}
              onChange={(e) => setEmailVerified(e.target.checked)}
              className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
            />
            <label htmlFor="emailVerified" className="ml-2 block text-sm text-text-secondary">
              Email Verified
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              New Password (leave blank to keep current)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="Enter new password"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OAuthTab({ projectId }: { projectId: string }) {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadProviders();
  }, [projectId]);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const response = await api.getOAuthProviders(projectId);
      setProviders(response.data || []);
    } catch (err) {
      console.error('Failed to load OAuth providers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (providerId: string, name: string) => {
    if (!confirm(`Delete OAuth provider ${name}?`)) return;
    try {
      await api.deleteOAuthProvider(projectId, providerId);
      await loadProviders();
    } catch (err) {
      alert('Failed to delete provider');
    }
  };

  const maskClientId = (clientId: string) => {
    if (clientId.length <= 8) return '****';
    return clientId.slice(0, 4) + '****' + clientId.slice(-4);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary"
        >
          Add Provider
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-secondary">
          Loading OAuth providers...
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Client ID</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-text-inactive py-8">
                    No OAuth providers configured
                  </td>
                </tr>
              ) : (
                providers.map((provider) => (
                  <tr key={provider.id}>
                    <td className="font-medium text-text-primary">{provider.providerName}</td>
                    <td>
                      <code className="text-xs text-text-secondary">
                        {maskClientId(provider.clientId)}
                      </code>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          provider.enabled
                            ? 'badge-success'
                            : 'badge-neutral'
                        }`}
                      >
                        {provider.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="text-text-secondary">
                      {new Date(provider.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDelete(provider.id, provider.providerName)}
                        className="text-danger hover:text-danger-text text-sm font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddOAuthModal
          projectId={projectId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadProviders();
          }}
        />
      )}
    </div>
  );
}

function AddOAuthModal({
  projectId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [providerName, setProviderName] = useState('google');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      await api.configureOAuth(projectId, {
        providerName,
        clientId,
        clientSecret,
        enabled,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add provider');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-text-primary mb-4">Add OAuth Provider</h2>
        {error && (
          <div className="bg-danger-bg border border-danger/20 text-danger-text px-4 py-3 rounded-md text-sm mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Provider *
            </label>
            <select
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              className="input"
            >
              <option value="google">Google</option>
              <option value="github">GitHub</option>
              <option value="microsoft">Microsoft</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Client ID *
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Client Secret *
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className="input"
              required
            />
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="oauthEnabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
            />
            <label htmlFor="oauthEnabled" className="ml-2 block text-sm text-text-secondary">
              Enabled
            </label>
          </div>
          <div className="flex items-center justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AuditTab({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState('');

  useEffect(() => {
    loadLogs();
  }, [projectId, eventType]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const response = await api.getAuditLogs({
        projectId,
        eventType: eventType || undefined,
        limit: 50,
      });
      setLogs(response.data || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="input max-w-xs"
        >
          <option value="">All Event Types</option>
          <option value="login">Login</option>
          <option value="register">Register</option>
          <option value="password_reset">Password Reset</option>
          <option value="token_refresh">Token Refresh</option>
        </select>
        <button onClick={loadLogs} className="btn btn-secondary">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-secondary">Loading audit logs...</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Event Type</th>
                <th>Status</th>
                <th>User ID</th>
                <th>IP Address</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-text-inactive py-8">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="font-medium text-text-primary">{log.eventType}</td>
                    <td>
                      <span
                        className={`badge ${
                          log.status === 'success'
                            ? 'badge-success'
                            : 'badge-danger'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="text-text-secondary">
                      {log.userId ? (
                        <code className="text-xs text-text-secondary">{log.userId}</code>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="text-text-secondary">{log.ipAddress || '-'}</td>
                    <td className="text-text-secondary">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}