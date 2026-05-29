import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

interface Project {
  id: string;
  name: string;
  description: string;
  environment: string;
  enabled: boolean;
  userTableName: string;
  siteUrl?: string;
  redirectUrls?: string[];
  createdAt: string;
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [projects, searchQuery, environmentFilter, statusFilter]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await api.getProjects();
      setProjects(response.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...projects];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query))
      );
    }

    // Environment filter
    if (environmentFilter) {
      filtered = filtered.filter((p) => p.environment === environmentFilter);
    }

    // Status filter
    if (statusFilter) {
      const isEnabled = statusFilter === 'enabled';
      filtered = filtered.filter((p) => p.enabled === isEnabled);
    }

    setFilteredProjects(filtered);
    setPage(0);
  };

  const paginatedProjects = filteredProjects.slice(
    page * pageSize,
    (page + 1) * pageSize
  );

  const totalPages = Math.ceil(filteredProjects.length / pageSize);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete project "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.deleteProject(id);
      await loadProjects();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-secondary">Loading projects...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Projects</h1>
          <p className="text-text-secondary mt-1">Manage authentication projects and their settings</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Create Project
        </button>
      </div>

      {error && (
        <div className="bg-danger-bg border border-danger/20 text-danger-text px-4 py-3 rounded-md mb-6">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Search Projects
            </label>
            <input
              type="text"
              placeholder="Search by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Environment
            </label>
            <select
              value={environmentFilter}
              onChange={(e) => setEnvironmentFilter(e.target.value)}
              className="input w-full"
            >
              <option value="">All Environments</option>
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input w-full"
            >
              <option value="">All Status</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {filteredProjects.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-text-inactive mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-text-primary mb-2">No projects yet</h3>
            <p className="text-text-secondary mb-6">Get started by creating your first project</p>
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
              Create Your First Project
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="text-text-secondary">Name</th>
                <th className="text-text-secondary">Environment</th>
                <th className="text-text-secondary">User Table</th>
                <th className="text-text-secondary">Status</th>
                <th className="text-text-secondary">Created</th>
                <th className="text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProjects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link to={`/dashboard/projects/${project.id}`} className="font-medium text-primary hover:underline">
                      {project.name}
                    </Link>
                    {project.description && (
                      <div className="text-xs text-text-secondary mt-1">{project.description}</div>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-neutral">
                      {project.environment}
                    </span>
                  </td>
                  <td>
                    <code className="text-xs text-text-secondary font-mono bg-hover px-1 py-0.5 rounded">{project.userTableName}</code>
                  </td>
                  <td>
                    <span className={`badge ${
                      project.enabled
                        ? 'badge-success'
                        : 'badge-neutral'
                    }`}>
                      {project.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="text-text-secondary">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="flex items-center space-x-2">
                      <Link
                        to={`/dashboard/projects/${project.id}`}
                        className="text-primary hover:underline text-sm font-medium"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(project.id, project.name)}
                        className="text-danger hover:text-danger-hover text-sm font-medium"
                      >
                        Delete
                      </button>

                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {filteredProjects.length > pageSize && (
        <div className="flex items-center justify-center space-x-2 mt-6">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-text-secondary">
            Page {page + 1} of {totalPages} • Showing {paginatedProjects.length} of {filteredProjects.length} projects
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages - 1}
            className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadProjects();
          }}
        />
      )}
    </div>
  );
}

interface CreateProjectModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CreateProjectModal({ onClose, onSuccess }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [siteUrl, setSiteUrl] = useState('');
  const [redirectUrls, setRedirectUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Parse redirect URLs from textarea (one per line)
      const redirectUrlsArray = redirectUrls
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

      await api.createProject({
        name,
        description,
        environment,
        siteUrl: siteUrl.trim() || undefined,
        redirectUrls: redirectUrlsArray.length > 0 ? redirectUrlsArray : undefined,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="card max-w-2xl w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">Create New Project</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-danger-bg border border-danger/20 text-danger-text px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-text-secondary mb-2">
              Project Name <span className="text-danger">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full"
              placeholder="my-app"
              pattern="[a-z0-9_-]+"
              title="Only lowercase letters, numbers, hyphens, and underscores"
              required
            />
            <p className="text-xs text-text-secondary mt-1">
              Use lowercase letters, numbers, hyphens, and underscores only
            </p>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-text-secondary mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full"
              rows={3}
              placeholder="Optional description of this project"
            />
          </div>

          <div>
            <label htmlFor="environment" className="block text-sm font-medium text-text-secondary mb-2">
              Environment <span className="text-danger">*</span>
            </label>
            <select
              id="environment"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="input w-full"
            >
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </div>

          <div>
            <label htmlFor="siteUrl" className="block text-sm font-medium text-text-secondary mb-2">
              Site URL
            </label>
            <input
              id="siteUrl"
              type="url"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              className="input w-full"
              placeholder="https://myapp.com"
            />
            <p className="text-xs text-text-secondary mt-1">
              Main site URL used for email callback links (optional)
            </p>
          </div>

          <div>
            <label htmlFor="redirectUrls" className="block text-sm font-medium text-text-secondary mb-2">
              Redirect URLs
            </label>
            <textarea
              id="redirectUrls"
              value={redirectUrls}
              onChange={(e) => setRedirectUrls(e.target.value)}
              className="input w-full"
              rows={3}
              placeholder="https://myapp.com/auth/callback&#10;https://myapp.com/verify-email"
            />
            <p className="text-xs text-text-secondary mt-1">
              Allowed callback URLs for email verification (one per line, optional)
            </p>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}