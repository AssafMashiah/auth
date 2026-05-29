import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface DashboardProps {
  onLogout: () => void;
  onThemeChange?: (theme: "system" | "light" | "dark") => void;
}

export default function Dashboard({ onLogout, onThemeChange }: DashboardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminDisplayName, setAdminDisplayName] = useState("Admin User");

  useEffect(() => {
    const updateAdminName = () => {
      const userStr = localStorage.getItem("admin_user");
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          if (user.displayName) {
            setAdminDisplayName(user.displayName);
          }
        } catch (e) {
          console.error("Failed to parse admin user", e);
        }
      }
    };

    updateAdminName();

    const handleUserUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.displayName) {
        setAdminDisplayName(customEvent.detail.displayName);
      } else {
        updateAdminName();
      }
    };

    // Listen for custom event to update name immediately
    window.addEventListener(
      "admin-user-updated",
      handleUserUpdate as EventListener,
    );
    return () =>
      window.removeEventListener(
        "admin-user-updated",
        handleUserUpdate as EventListener,
      );
  }, []);

  useEffect(() => {
    const requiresSetup =
      localStorage.getItem("admin_requires_setup") === "true";
    if (requiresSetup && location.pathname !== "/dashboard/admin-users") {
      navigate("/dashboard/admin-users");
    }
  }, [location.pathname, navigate]);

  const handleLogout = async () => {
    try {
      await api.logout();
      onLogout();
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className="h-screen flex bg-page overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-page border-r border-border text-text-primary flex flex-col">
        <div className="p-6 flex flex-col items-center text-center">
          <img
            src="/logo.svg"
            alt="Auth Service"
            className="h-16 w-auto rounded-lg dark:hidden"
          />
          <img
            src="/logo_dark.svg"
            alt="Auth Service"
            className="h-16 w-auto rounded-lg hidden dark:block"
          />
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <Link
            to="/dashboard/projects"
            className={`block px-4 py-2 rounded transition-colors ${
              isActive("/dashboard/projects")
                ? "bg-hover text-text-primary font-medium"
                : "text-text-secondary hover:bg-hover hover:text-text-primary"
            }`}
          >
            <div className="flex items-center">
              <svg
                className="w-4 h-4 mr-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              Projects
            </div>
          </Link>

          <Link
            to="/dashboard/admin-users"
            className={`block px-4 py-2 rounded transition-colors ${
              isActive("/dashboard/admin-users")
                ? "bg-hover text-text-primary font-medium"
                : "text-text-secondary hover:bg-hover hover:text-text-primary"
            }`}
          >
            <div className="flex items-center">
              <svg
                className="w-4 h-4 mr-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              Admin Users
            </div>
          </Link>

          <Link
            to="/dashboard/audit-logs"
            className={`block px-4 py-2 rounded transition-colors ${
              isActive("/dashboard/audit-logs")
                ? "bg-hover text-text-primary font-medium"
                : "text-text-secondary hover:bg-hover hover:text-text-primary"
            }`}
          >
            <div className="flex items-center">
              <svg
                className="w-4 h-4 mr-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Audit Logs
            </div>
          </Link>

          <Link
            to="/dashboard/api-docs"
            className={`block px-4 py-2 rounded transition-colors ${
              isActive("/dashboard/api-docs")
                ? "bg-hover text-text-primary font-medium"
                : "text-text-secondary hover:bg-hover hover:text-text-primary"
            }`}
          >
            <div className="flex items-center">
              <svg
                className="w-4 h-4 mr-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
              API Docs
            </div>
          </Link>
        </nav>

        <div className="p-4 space-y-1">
          <Link
            to="/dashboard/settings"
            className={`w-full px-4 py-2 text-left rounded transition-colors flex items-center ${
              isActive("/dashboard/settings")
                ? "bg-hover text-text-primary font-medium"
                : "text-text-secondary hover:bg-hover hover:text-text-primary"
            }`}
          >
            <svg
              className="w-4 h-4 mr-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Settings
          </Link>
        </div>

        <div className="p-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-left text-text-secondary hover:bg-hover hover:text-text-primary rounded transition-colors flex items-center"
          >
            <svg
              className="w-4 h-4 mr-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-page border-b border-border h-[48px] flex items-center">
          <div className="px-8 w-full flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">
              {isActive("/dashboard/projects")
                ? "Projects"
                : isActive("/dashboard/admin-users")
                  ? "Admin Users"
                  : isActive("/dashboard/audit-logs")
                    ? "Audit Logs"
                    : isActive("/dashboard/api-docs")
                      ? "API Documentation"
                      : isActive("/dashboard/settings")
                        ? "System Settings"
                        : "Dashboard"}
            </h2>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-text-secondary">
                {adminDisplayName}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 overflow-auto bg-page">
          <Outlet context={{ onThemeChange }} />
        </main>
      </div>
    </div>
  );
}