import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { api } from './lib/api';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import AdminUsers from './pages/AdminUsers';
import AuditLogs from './pages/AuditLogs';
import ApiDocs from './pages/ApiDocs';
import Settings from './pages/Settings';

interface SystemSettings {
  theme: "system" | "light" | "dark";
  keep_logs: boolean;
}

function AppRoutes() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!api.getSessionToken();
  });
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  const applyTheme = (currentTheme: "system" | "light" | "dark") => {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const useDark =
      currentTheme === "dark" || (currentTheme === "system" && prefersDark);
    document.documentElement.classList.toggle("dark", useDark);
  };

  // Initial theme load
  useEffect(() => {
    const loadTheme = async () => {
      // If not authenticated, use system preference
      if (!isAuthenticated) {
        applyTheme("system");
        setTheme("system");
        return;
      }

      try {
        const res = await api.getSettings();
        if (res.success && res.data) {
          const settings = res.data as SystemSettings;
          setTheme(settings.theme);
          applyTheme(settings.theme);
        } else {
          applyTheme("system");
        }
      } catch (err: any) {
        // Only log if not a session error (handled globally)
        if (err.message !== 'Session expired' && err.message !== 'Invalid session' && err.message !== 'No admin session') {
          console.error("Failed to load theme settings:", err);
        }
        applyTheme("system");
      }
    };

    loadTheme();
  }, [isAuthenticated]);

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");

    if (media.addEventListener) {
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    } else {
      // Fallback for older browsers
      media.addListener(handler);
      return () => media.removeListener(handler);
    }
  }, [theme]);

  // Register session expiration handler
  useEffect(() => {
    api.setSessionExpiredHandler(() => {
      setIsAuthenticated(false);
      navigate('/login', { replace: true });
    });
  }, [navigate]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Login onLogin={() => setIsAuthenticated(true)} />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          isAuthenticated ? (
            <Dashboard
              onLogout={() => setIsAuthenticated(false)}
              onThemeChange={(newTheme) => {
                setTheme(newTheme);
                applyTheme(newTheme);
              }}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route index element={<Navigate to="/dashboard/projects" replace />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="admin-users" element={<AdminUsers />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="api-docs" element={<ApiDocs />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter basename="/admin">
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;