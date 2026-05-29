import { useState, useEffect } from 'react';
import { useOutletContext } from "react-router-dom";
import { api } from '../lib/api';

interface SystemSettings {
  theme: 'system' | 'light' | 'dark';
  keep_logs: boolean;
}

interface SettingsContext {
  onThemeChange?: (theme: "system" | "light" | "dark") => void;
}

interface EmailProviderConfig {
  apiKey?: string;
  domain?: string;
  region?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  secretKey?: string;
  secure?: boolean;
  accountId?: string;
  apiToken?: string;
}

interface EmailProvider {
  id: string;
  name: string;
  provider: string;
  type: "api" | "smtp";
  isDefault: boolean;
  isFallback: boolean;
  config: EmailProviderConfig;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
}

interface EmailTemplate {
  id: string;
  type: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export default function Settings() {
  const { onThemeChange } = useOutletContext<SettingsContext>() || {};
  const [activeTab, setActiveTab] = useState<'general' | 'providers' | 'templates'>('general');
  const [settings, setSettings] = useState<SystemSettings>({ theme: 'system', keep_logs: true });
  const [providers, setProviders] = useState<EmailProvider[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'general') {
        const res = await api.getSettings();
        if (res.success && res.data) setSettings(res.data as SystemSettings);
      } else if (activeTab === 'providers') {
        const res = await api.getEmailProviders();
        if (res.success && res.data) setProviders(res.data as EmailProvider[]);
      } else if (activeTab === 'templates') {
        const res = await api.getEmailTemplates();
        if (res.success && res.data) setTemplates(res.data as EmailTemplate[]);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = (theme: 'system' | 'light' | 'dark') => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', useDark);
  };

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (settings.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    if (media.addEventListener) {
      media.addEventListener('change', handler);
      return () => media.removeEventListener('change', handler);
    }
    media.addListener(handler);
    return () => media.removeListener(handler);
  }, [settings.theme]);

  const handleThemeChange = async (theme: 'system' | 'light' | 'dark') => {
    const newSettings = { ...settings, theme };
    setSettings(newSettings);
    applyTheme(theme);
    if (onThemeChange) onThemeChange(theme);

    try {
      await api.updateSettings(newSettings);
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Failed to update theme: ' + err.message });
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      await api.updateSettings(settings);
      setMessage({ type: 'success', text: 'Settings updated' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">System Settings</h1>
      </div>

      {message && (
        <div className={`p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          {(['general', 'providers', 'templates'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize`}
            >
              {tab === 'providers' ? 'Email Providers' : tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'general' && (
        <div className="card p-6 space-y-6 max-w-2xl">
          <div>
            <h3 className="text-lg font-medium text-text-primary mb-4">Appearance</h3>
            <div className="grid grid-cols-3 gap-4">
              {['system', 'light', 'dark'].map((theme) => (
                <button
                  key={theme}
                  onClick={() => handleThemeChange(theme as any)}
                  className={`p-4 rounded-lg border-2 flex flex-col items-center justify-center space-y-2 transition-all ${
                    settings.theme === theme
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className="capitalize font-medium text-text-primary">{theme}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-text-primary mb-4">Audit Logs</h3>
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="keep_logs"
                checked={settings.keep_logs}
                onChange={(e) => setSettings({ ...settings, keep_logs: e.target.checked })}
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="keep_logs" className="text-text-primary">Keep audit logs indefinitely</label>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <button onClick={saveSettings} disabled={loading} className="btn btn-primary">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'providers' && <EmailProvidersTab providers={providers} onUpdate={loadData} />}
      {activeTab === 'templates' && <EmailTemplatesTab templates={templates} onUpdate={loadData} />}
    </div>
  );
}

function EmailProvidersTab({ providers, onUpdate }: { providers: EmailProvider[]; onUpdate: () => void }) {
  const [editing, setEditing] = useState<EmailProvider | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleSetDefault = async (id: string) => {
    setUpdatingId(id);
    try {
      await api.updateEmailProvider(id, { isDefault: true });
      onUpdate();
    } catch (err) {
      alert('Failed to update default provider');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSetFallback = async (id: string) => {
    setUpdatingId(id);
    try {
      await api.updateEmailProvider(id, { isFallback: true });
      onUpdate();
    } catch (err) {
      alert('Failed to update fallback provider');
    } finally {
      setUpdatingId(null);
    }
  };

  if (isCreating || editing) {
    return (
      <EmailProviderForm
        initialData={editing}
        onCancel={() => { setEditing(null); setIsCreating(false); }}
        onSuccess={() => { setEditing(null); setIsCreating(false); onUpdate(); }}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Routing Section */}
      {providers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-lg font-medium text-text-primary mb-2">Default Provider</h3>
            <p className="text-sm text-text-secondary mb-4">
              The primary service used for delivering all system emails.
            </p>
            <div className="space-y-2">
              {providers.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    p.isDefault
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:bg-hover hover:border-border-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="default_provider"
                    checked={p.isDefault}
                    onChange={() => handleSetDefault(p.id)}
                    disabled={updatingId !== null}
                    className="w-4 h-4 text-primary focus:ring-primary border-gray-300"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-text-primary">{p.name}</div>
                    <div className="text-xs text-text-secondary">{p.provider} • {p.fromEmail}</div>
                  </div>
                  {p.isDefault && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-medium text-text-primary mb-2">Fallback Provider</h3>
            <p className="text-sm text-text-secondary mb-4">
              Used automatically if the default provider fails to deliver.
            </p>
            <div className="space-y-2">
              {providers.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    p.isFallback
                      ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10 ring-1 ring-yellow-500'
                      : 'border-border hover:bg-hover hover:border-border-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="fallback_provider"
                    checked={p.isFallback}
                    onChange={() => handleSetFallback(p.id)}
                    disabled={updatingId !== null}
                    className="w-4 h-4 text-yellow-600 focus:ring-yellow-500 border-gray-300"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-text-primary">{p.name}</div>
                    <div className="text-xs text-text-secondary">{p.provider} • {p.fromEmail}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Providers List */}
      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-border pb-4">
          <h2 className="text-lg font-medium text-text-primary">Configured Providers</h2>
          <button onClick={() => setIsCreating(true)} className="btn btn-primary">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Provider
          </button>
        </div>

        <div className="grid gap-4">
          {providers.map((provider) => (
            <div key={provider.id} className="card p-6 flex items-center justify-between group hover:border-primary/30 transition-colors">
              <div>
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-medium text-text-primary">{provider.name}</h3>
                  <div className="flex space-x-2">
                    {provider.isDefault && <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">Default</span>}
                    {provider.isFallback && <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-500/20">Fallback</span>}
                    {!provider.enabled && <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Disabled</span>}
                  </div>
                </div>
                <div className="flex items-center space-x-4 mt-2 text-sm text-text-secondary">
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    {provider.fromEmail}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-border"></span>
                  <span className="flex items-center uppercase tracking-wider text-xs font-semibold">
                    {provider.provider}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-border"></span>
                  <span className="uppercase text-xs">{provider.type}</span>
                </div>
              </div>
              <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditing(provider)} className="btn btn-secondary text-sm">Edit</button>
                <button
                  onClick={async () => {
                    if (confirm('Are you sure you want to delete this provider?')) {
                      await api.deleteEmailProvider(provider.id);
                      onUpdate();
                    }
                  }}
                  className="btn btn-secondary text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-900/30"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {providers.length === 0 && (
            <div className="text-center py-12 rounded-lg border-2 border-dashed border-border bg-gray-50/50 dark:bg-gray-900/50">
              <svg className="w-12 h-12 mx-auto text-text-secondary mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-medium text-text-primary">No Email Providers</h3>
              <p className="text-text-secondary mt-1 max-w-sm mx-auto">
                Configure an email provider to start sending transactional emails.
              </p>
              <button onClick={() => setIsCreating(true)} className="btn btn-primary mt-6">
                Add First Provider
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailProviderForm({ initialData, onCancel, onSuccess }: { initialData: EmailProvider | null; onCancel: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState<Partial<EmailProvider>>(initialData || {
    name: '',
    provider: 'sendgrid',
    type: 'api',
    isDefault: false,
    isFallback: false,
    enabled: true,
    fromEmail: '',
    fromName: '',
    config: {},
  });
  const [loading, setLoading] = useState(false);

  const providerOptions: { value: string; label: string }[] = [
    { value: "sendgrid",   label: "SendGrid"   },
    { value: "postmark",   label: "Postmark"   },
    { value: "mailgun",    label: "Mailgun"    },
    { value: "brevo",      label: "Brevo"      },
    { value: "mailersend", label: "MailerSend" },
    { value: "mailchimp",  label: "Mailchimp"  },
    { value: "mailjet",    label: "Mailjet"    },
    { value: "smtp2go",    label: "SMTP2Go"    },
    { value: "mailtrap",   label: "Mailtrap"   },
    { value: "resend",     label: "Resend"     },
    { value: "cloudflare", label: "Cloudflare" },
    { value: "smtp",       label: "SMTP"       },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (initialData) {
        await api.updateEmailProvider(initialData.id, formData);
      } else {
        await api.createEmailProvider(formData);
      }
      onSuccess();
    } catch (err) {
      alert('Failed to save provider');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6 max-w-2xl">
      <h3 className="text-lg font-medium text-text-primary mb-6">
        {initialData ? "Edit Provider" : "New Provider"}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Name
          </label>
          <input
            type="text"
            className="input w-full"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Provider
            </label>
            <select
              className="input w-full"
              value={formData.provider}
              onChange={(e) =>
                setFormData({ ...formData, provider: e.target.value })
              }
            >
              {providerOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Type
            </label>
            <select
              className="input w-full"
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value as any })
              }
            >
              <option value="api">API</option>
              <option value="smtp">SMTP</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              From Email
            </label>
            <input
              type="email"
              className="input w-full"
              value={formData.fromEmail}
              onChange={(e) =>
                setFormData({ ...formData, fromEmail: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              From Name
            </label>
            <input
              type="text"
              className="input w-full"
              value={formData.fromName}
              onChange={(e) =>
                setFormData({ ...formData, fromName: e.target.value })
              }
            />
          </div>
        </div>

        <div className="border-t border-border pt-4 mt-4">
          <h4 className="text-sm font-medium text-text-primary mb-3">
            Configuration
          </h4>
          <div className="space-y-4">
            {formData.type === "api" ? (
              <>
                {formData.provider !== "cloudflare" && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      {formData.provider === "postmark"
                        ? "Server Token"
                        : "API Key"}
                    </label>
                    <input
                      type="password"
                      className="input w-full"
                      value={formData.config?.apiKey || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: { ...formData.config, apiKey: e.target.value },
                        })
                      }
                      required={formData.type === "api"}
                    />
                  </div>
                )}

                {/* Mailjet Secret Key */}
                {["mailjet"].includes(formData.provider || "") && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Secret Key
                    </label>
                    <input
                      type="password"
                      className="input w-full"
                      value={formData.config?.secretKey || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: {
                            ...formData.config,
                            secretKey: e.target.value,
                          },
                        })
                      }
                      required
                    />
                  </div>
                )}

                {/* Cloudflare — optional account override */}
                {formData.provider === "cloudflare" && (
                  <>
                    <p className="text-xs text-text-secondary bg-surface-secondary rounded p-3">
                      By default the Worker's <code>CF_ACCOUNT_ID</code> and <code>CF_API_TOKEN</code> secrets are used.
                      Fill in the fields below only if you want to send from a different Cloudflare account.
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Account ID <span className="text-text-secondary font-normal">(optional override)</span>
                      </label>
                      <input
                        type="text"
                        className="input w-full font-mono text-sm"
                        value={formData.config?.accountId || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: { ...formData.config, accountId: e.target.value },
                          })
                        }
                        placeholder="Leave blank to use CF_ACCOUNT_ID secret"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        API Token <span className="text-text-secondary font-normal">(optional override)</span>
                      </label>
                      <input
                        type="password"
                        className="input w-full"
                        value={formData.config?.apiToken || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: { ...formData.config, apiToken: e.target.value },
                          })
                        }
                        placeholder="Leave blank to use CF_API_TOKEN secret"
                      />
                    </div>
                  </>
                )}

                {/* Mailgun Domain & Region */}
                {["mailgun"].includes(formData.provider || "") && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Domain
                      </label>
                      <input
                        type="text"
                        className="input w-full"
                        value={formData.config?.domain || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: {
                              ...formData.config,
                              domain: e.target.value,
                            },
                          })
                        }
                        placeholder="mg.example.com"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Region
                      </label>
                      <select
                        className="input w-full"
                        value={formData.config?.region || "us"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            config: {
                              ...formData.config,
                              region: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="us">US (Default)</option>
                        <option value="eu">EU</option>
                      </select>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Host
                    </label>
                    <input
                      type="text"
                      className="input w-full"
                      value={formData.config?.host || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: { ...formData.config, host: e.target.value },
                        })
                      }
                      required={formData.type === "smtp"}
                      placeholder="smtp.example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      className="input w-full"
                      value={formData.config?.port || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: {
                            ...formData.config,
                            port: parseInt(e.target.value),
                          },
                        })
                      }
                      required={formData.type === "smtp"}
                      placeholder="587"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      className="input w-full"
                      value={formData.config?.username || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: {
                            ...formData.config,
                            username: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      className="input w-full"
                      value={formData.config?.password || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          config: {
                            ...formData.config,
                            password: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="smtp_secure"
                    checked={formData.config?.secure || false}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        config: {
                          ...formData.config,
                          secure: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                  />
                  <label
                    htmlFor="smtp_secure"
                    className="text-sm text-text-secondary"
                  >
                    Use Secure Connection (TLS/SSL)
                  </label>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-4 pt-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) =>
                setFormData({ ...formData, enabled: e.target.checked })
              }
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-text-primary">Enabled</span>
          </label>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? "Saving..." : "Save Provider"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EmailTemplatesTab({ templates, onUpdate }: { templates: EmailTemplate[]; onUpdate: () => void }) {
  const [selectedType, setSelectedType] = useState<string>('welcome');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const templateVariables: Record<string, string[]> = {
    welcome: ["app_name", "project_name", "extra_data"],
    confirmation: [
      "app_name",
      "project_name",
      "confirmation_url",
      "action_url",
    ],
    password_reset: ["app_name", "project_name", "reset_url", "action_url"],
    magic_link: ["app_name", "project_name", "action_url"],
    email_change: ["app_name", "project_name", "action_url"],
    otp: ["app_name", "project_name", "otp"],
  };
  const availableVariables = templateVariables[selectedType] || [];

  useEffect(() => {
    if (templates.length > 0) {
      const tmpl = templates.find(t => t.type === selectedType);
      setEditingTemplate(tmpl || null);
    }
  }, [selectedType, templates]);

  const handleSave = async () => {
    if (!editingTemplate) return;
    setLoading(true);
    try {
      await api.updateEmailTemplate(editingTemplate.type, {
        subject: editingTemplate.subject,
        bodyHtml: editingTemplate.bodyHtml,
        bodyText: editingTemplate.bodyText
      });
      onUpdate();
      // Optional: show toast
    } catch (err: any) {
      alert('Failed to save template: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-[calc(100vh-200px)]">
      <div className="col-span-3 border-r border-border pr-4">
        <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-3">Templates</h3>
        <div className="space-y-1">
          {['welcome', 'confirmation', 'password_reset', 'magic_link', 'email_change', 'otp'].map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
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
        {editingTemplate ? (
          <div className="flex flex-col h-full space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Subject</label>
              <input
                type="text"
                className="input w-full"
                value={editingTemplate.subject}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
              />
            </div>

            <div className="flex-1 flex flex-col">
              <label className="block text-sm font-medium text-text-secondary mb-1">HTML Content</label>
              <textarea
                className="input w-full flex-1 font-mono text-sm"
                value={editingTemplate.bodyHtml}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, bodyHtml: e.target.value })}
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <p className="text-xs text-text-secondary">
                Available variables: {availableVariables.map((variable) => `{{${variable}}}`).join(', ')}
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowPreview(true)}
                  className="btn btn-secondary"
                >
                  Preview
                </button>
                <button onClick={handleSave} disabled={loading} className="btn btn-primary">
                  {loading ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-text-secondary">
            {templates.length === 0 ? 'Loading templates...' : 'Select a template to edit'}
          </div>
        )}
      </div>

      {showPreview && editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-page rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-border">
            <div className="p-4 border-b border-border flex justify-between items-center bg-page rounded-t-lg">
              <h3 className="font-semibold text-lg text-text-primary">Preview: {editingTemplate.subject}</h3>
              <button onClick={() => setShowPreview(false)} className="text-text-secondary hover:text-text-primary">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-8 bg-gray-100 dark:bg-gray-900">
               <div
                 className="bg-white text-black mx-auto max-w-2xl min-h-[400px] shadow-sm p-8 rounded-sm"
                 dangerouslySetInnerHTML={{ __html: editingTemplate.bodyHtml }}
               />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
