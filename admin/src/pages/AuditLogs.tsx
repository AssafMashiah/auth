import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface AuditLog {
  id: string;
  projectId: string;
  projectName?: string;
  eventType: string;
  status: string;
  userId?: string;
  ipAddress?: string;
  metadata?: any;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedEventType, setSelectedEventType] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [selectedProject, selectedEventType, page]);

  const loadProjects = async () => {
    try {
      const response = await api.getProjects();
      setProjects(response.data || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.getAuditLogs({
        projectId: selectedProject || undefined,
        eventType: selectedEventType || undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      setLogs(response.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setPage(0);
    loadLogs();
  };

  const handleExport = () => {
    // Simple CSV export
    const headers = ['Timestamp', 'Project', 'Event Type', 'Status', 'User ID', 'IP Address'];
    const rows = logs.map(log => [
      new Date(log.createdAt).toISOString(),
      log.projectName || log.projectId,
      log.eventType,
      log.status,
      log.userId || '',
      log.ipAddress || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Audit Logs</h1>
          <p className="text-text-secondary mt-1">View all authentication events across projects</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={handleRefresh} className="btn btn-secondary flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button onClick={handleExport} className="btn btn-secondary flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-danger-bg border border-danger/20 text-danger-text px-4 py-3 rounded-md mb-6">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Filter by Project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => {
                setSelectedProject(e.target.value);
                setPage(0);
              }}
              className="input"
            >
              <option value="">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Filter by Event Type
            </label>
            <select
              value={selectedEventType}
              onChange={(e) => {
                setSelectedEventType(e.target.value);
                setPage(0);
              }}
              className="input"
            >
              <option value="">All Event Types</option>
              <option value="login">Login</option>
              <option value="register">Register</option>
              <option value="password_reset">Password Reset</option>
              <option value="password_reset_confirm">Password Reset Confirm</option>
              <option value="token_refresh">Token Refresh</option>
              <option value="logout">Logout</option>
              <option value="email_verification">Email Verification</option>
              <option value="oauth_login">OAuth Login</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-text-secondary">Loading audit logs...</div>
        </div>
      ) : (
        <>
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Project</th>
                    <th>Event Type</th>
                    <th>Status</th>
                    <th>User ID</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-text-inactive py-8">
                        No audit logs found
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id}>
                        <td className="text-text-secondary whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td>
                          <span className="text-sm font-medium text-text-primary">
                            {log.projectName || log.projectId}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-info">
                            {log.eventType}
                          </span>
                        </td>
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
                            <code className="text-xs">{log.userId.slice(0, 8)}...</code>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="text-text-secondary">{log.ipAddress || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {logs.length >= pageSize && (
            <div className="flex items-center justify-center space-x-2 mt-6">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-text-secondary">
                Page {page + 1} • Showing {logs.length} logs
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={logs.length < pageSize}
                className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}