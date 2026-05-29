import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  enabled: boolean;
  createdAt: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await api.getAdminUsers();
      const usersList = response.data || [];
      setUsers(usersList);

      // Check for forced setup
      const requiresSetup =
        localStorage.getItem("admin_requires_setup") === "true";
      if (requiresSetup) {
        // Find current user (assuming it's admin@example.com based on flag)
        // Or we should verify against current logged in user email if possible,
        // but checking admin@example.com is safe enough for the specific requirement.
        const defaultAdmin = usersList.find(
          (u) => u.email === "admin@example.com",
        );
        if (defaultAdmin) {
          setEditingUser(defaultAdmin);
          // Optional: Show a toast or notification explaining why
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin users');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Are you sure you want to delete admin user "${email}"?`)) {
      return;
    }

    try {
      await api.deleteAdminUser(id);
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete admin user');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-secondary">Loading admin users...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Admin Users</h1>
          <p className="text-text-secondary mt-1">Manage administrators who can access this admin panel</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Create Admin
        </button>
      </div>

      {error && (
        <div className="bg-danger-bg border border-danger/20 text-danger-text px-4 py-3 rounded-md mb-6">
          {error}
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {users.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-text-inactive mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-text-primary mb-2">No admin users yet</h3>
            <p className="text-text-secondary mb-6">Create your first admin user to get started</p>
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
              Create First Admin
            </button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Display Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="font-medium text-text-primary">{user.email}</td>
                  <td className="text-text-secondary">{user.displayName}</td>
                  <td>
                    <span className="badge badge-info">
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${
                      user.enabled
                        ? 'badge-success'
                        : 'badge-neutral'
                    }`}>
                      {user.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="text-text-secondary">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="text-primary hover:underline text-sm font-medium"
                      >
                        Edit
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreateModal && (
        <CreateAdminModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadUsers();
          }}
        />
      )}

      {editingUser && (
        <EditAdminModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            setEditingUser(null);
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

interface CreateAdminModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CreateAdminModal({ onClose, onSuccess }: CreateAdminModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.createAdminUser({
        email,
        password,
        displayName,
        role,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create admin user');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">Create Admin User</h2>
          <button onClick={onClose} className="text-text-inactive hover:text-text-secondary">
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
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">
              Email <span className="text-danger">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-2">
              Password <span className="text-danger">*</span>
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              minLength={8}
              required
            />
            <p className="text-xs text-text-subtle mt-1">Minimum 8 characters</p>
          </div>

          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-text-secondary mb-2">
              Display Name <span className="text-danger">*</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-text-secondary mb-2">
              Role <span className="text-danger">*</span>
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="input"
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Creating...' : 'Create Admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditAdminModalProps {
  user: AdminUser;
  onClose: () => void;
  onSuccess: () => void;
}

function EditAdminModal({ user, onClose, onSuccess }: EditAdminModalProps) {
  const [email, setEmail] = useState(user.email);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState(user.role);
  const [enabled, setEnabled] = useState(user.enabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const updates: any = {
        displayName,
        role,
        enabled,
      };

      if (email !== user.email) {
        updates.email = email;
      }

      await api.updateAdminUser(user.id, updates);

      // If this was the forced setup for admin@example.com, clear the flag if email changed
      if (user.email === "admin@example.com" && email !== "admin@example.com") {
        localStorage.removeItem("admin_requires_setup");
      }

      // Check if updating current user to update local state and UI
      const currentUserStr = localStorage.getItem('admin_user');
      if (currentUserStr) {
        try {
          const currentUser = JSON.parse(currentUserStr);
          // Check by ID or email to ensure we catch the current user update
          if (currentUser.id === user.id || currentUser.email === user.email) {
            const updatedUser = { ...currentUser, ...updates };
            // Ensure displayName is updated in the local storage object
            updatedUser.displayName = updates.displayName || displayName;
            
            localStorage.setItem('admin_user', JSON.stringify(updatedUser));
            
            // Dispatch custom event with the new user data
            const event = new CustomEvent('admin-user-updated', { detail: updatedUser });
            window.dispatchEvent(event);
          }
        } catch (e) {
          console.error('Failed to update local user state', e);
        }
      }

      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update admin user",
      );
      setLoading(false);
    }
  };

  if (showPasswordModal) {
    return (
      <ChangePasswordModal
        userId={user.id}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={() => {
          setShowPasswordModal(false);
          // Optional: Show success message
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">
            Edit Admin User
          </h2>
          <button
            onClick={onClose}
            className="text-text-inactive hover:text-text-secondary"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
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
            <label
              htmlFor="editEmail"
              className="block text-sm font-medium text-text-secondary mb-2"
            >
              Email <span className="text-danger">*</span>
            </label>
            <input
              id="editEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label
              htmlFor="editDisplayName"
              className="block text-sm font-medium text-text-secondary mb-2"
            >
              Display Name <span className="text-danger">*</span>
            </label>
            <input
              id="editDisplayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label
              htmlFor="editRole"
              className="block text-sm font-medium text-text-secondary mb-2"
            >
              Role <span className="text-danger">*</span>
            </label>
            <select
              id="editRole"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="input"
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="editEnabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 text-primary focus:ring-primary border-input-border rounded"
            />
            <label
              htmlFor="editEnabled"
              className="ml-2 block text-sm text-text-secondary"
            >
              Account Enabled
            </label>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="btn btn-secondary"
            >
              Change Password
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ChangePasswordModalProps {
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function ChangePasswordModal({
  userId,
  onClose,
  onSuccess,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setLoading(true);

    try {
      await api.changeAdminPassword(userId, {
        currentPassword,
        newPassword,
      });
      setSuccessMessage("Password changed successfully");
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change password",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">
            Change Password
          </h2>
          <button
            onClick={onClose}
            className="text-text-inactive hover:text-text-secondary"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-danger-bg border border-danger/20 text-danger-text px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="bg-success-bg border border-success/20 text-success-text px-4 py-3 rounded-md text-sm">
              {successMessage}
            </div>
          )}

          <div>
            <label
              htmlFor="currentPassword"
              className="block text-sm font-medium text-text-secondary mb-2"
            >
              Current Password <span className="text-danger">*</span>
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-text-secondary mb-2"
            >
              New Password <span className="text-danger">*</span>
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              minLength={8}
              required
            />
            <p className="text-xs text-text-subtle mt-1">
              Minimum 8 characters
            </p>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-text-secondary mb-2"
            >
              Retype New Password <span className="text-danger">*</span>
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              minLength={8}
              required
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !!successMessage}
              className="btn btn-primary"
            >
              {loading ? "Changing..." : "Change Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}