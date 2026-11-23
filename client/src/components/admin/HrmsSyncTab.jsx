import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, masterEmployeesApi } from '../../api';
import { Spinner, Alert } from '../ui';
import { KeyRound, PlugZap, RefreshCw, CloudDownload, Webhook, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate, formatDateTime, getApiErrorMessage } from '../../utils/helpers';

export default function HrmsSyncTab({ enabled = true }) {
  const qc = useQueryClient();
  const [draftConfig, setDraftConfig] = useState({});
  const [secretsForm, setSecretsForm] = useState({
    clientSecret: '',
    webhookSecret: '',
    webhookSecretPrevious: '',
  });
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);

  const {
    data: syncStatusData,
    isLoading: isLoadingSyncStatus,
    isError: isSyncError,
  } = useQuery({
    queryKey: ['hrms-sync-status'],
    queryFn: () => masterEmployeesApi.getSyncStatus().then((r) => r.data?.data || {}),
    enabled,
  });

  const {
    data: webhookLogsData,
    isLoading: isLoadingWebhookLogs,
    isError: isWebhookError,
  } = useQuery({
    queryKey: ['hrms-webhook-logs'],
    queryFn: () => adminApi.getWebhookLogs({ limit: 25 }).then((r) => r.data),
    enabled,
  });

  const formValues = useMemo(
    () => ({
      clientId: draftConfig.clientId ?? syncStatusData?.clientId ?? '',
      authUrl: draftConfig.authUrl ?? syncStatusData?.authUrl ?? '',
      baseUrl: draftConfig.baseUrl ?? syncStatusData?.baseUrl ?? '',
    }),
    [draftConfig, syncStatusData]
  );

  const defaultWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhooks/officeportal`
      : '/api/webhooks/officeportal';
  const webhookUrl = syncStatusData?.webhookUrl || defaultWebhookUrl;

  const syncHrmsMutation = useMutation({
    mutationFn: (type = 'full') => masterEmployeesApi.syncHrms(type),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'HRMS directory synchronized successfully.');
      qc.invalidateQueries({ queryKey: ['master-employees'] });
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['designations'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['hrms-sync-status'] });
      qc.invalidateQueries({ queryKey: ['hrms-webhook-logs'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to synchronize with OfficePortal HRMS API')),
  });

  const testConnectionMutation = useMutation({
    mutationFn: () => masterEmployeesApi.testConnection(),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'OfficePortal connection verified!');
      qc.invalidateQueries({ queryKey: ['hrms-sync-status'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Connection test failed')),
  });

  const saveConfigMutation = useMutation({
    mutationFn: (payload) => masterEmployeesApi.updateHrmsConfig(payload),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'OfficePortal credentials saved!');
      setDraftConfig({});
      setSecretsForm({ clientSecret: '', webhookSecret: '', webhookSecretPrevious: '' });
      qc.invalidateQueries({ queryKey: ['hrms-sync-status'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to save credentials')),
  });

  const handleSave = (e) => {
    e.preventDefault();
    const payload = {
      clientId: formValues.clientId.trim(),
      authUrl: formValues.authUrl.trim(),
      baseUrl: formValues.baseUrl.trim(),
    };
    if (secretsForm.clientSecret.trim()) payload.clientSecret = secretsForm.clientSecret.trim();
    if (secretsForm.webhookSecret.trim()) payload.webhookSecret = secretsForm.webhookSecret.trim();
    if (secretsForm.webhookSecretPrevious.trim()) {
      payload.webhookSecretPrevious = secretsForm.webhookSecretPrevious.trim();
    }
    saveConfigMutation.mutate(payload);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {isSyncError && (
        <Alert
          type="error"
          title="Unable to Load HRMS Status"
          message="Could not load OfficePortal sync configuration from server."
        />
      )}

      {/* Configuration & Connection Test Card */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">OfficePortal Public API v1 Configuration</h2>
              <p className="text-xs text-slate-500">
                Credentials are stored server-side and masked. Login, signup, and pickers query the local PostgreSQL mirror (0 live API calls).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => testConnectionMutation.mutate()}
              disabled={testConnectionMutation.isPending || !syncStatusData?.hasClientSecret}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {testConnectionMutation.isPending ? <Spinner size={14} className="text-white" /> : <PlugZap size={14} />}
              Test Connection &amp; Refresh Quota
            </button>
            <button
              type="button"
              onClick={() => syncHrmsMutation.mutate('delta')}
              disabled={syncHrmsMutation.isPending || !syncStatusData?.hasClientSecret}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncHrmsMutation.isPending ? 'animate-spin' : ''} />
              Delta Sync (Changes)
            </button>
            <button
              type="button"
              onClick={() => syncHrmsMutation.mutate('full')}
              disabled={syncHrmsMutation.isPending || !syncStatusData?.hasClientSecret}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <CloudDownload size={14} />
              Full Bootstrap Sync
            </button>
          </div>
        </div>

        {/* Quota & Synced Counts Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-[11px] font-bold uppercase text-slate-500">Daily Quota Remaining</p>
            <p className="text-xl font-black text-slate-900 mt-1">
              {syncStatusData?.quota?.dailyRemaining ?? '—'}{' '}
              <span className="text-xs font-semibold text-slate-400">
                / {syncStatusData?.quota?.dailyLimit ?? 500}
              </span>
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Rate limit: {syncStatusData?.quota?.perMinuteLimit ?? 30}/min
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-[11px] font-bold uppercase text-slate-500">Monthly Quota Remaining</p>
            <p className="text-xl font-black text-slate-900 mt-1">
              {syncStatusData?.quota?.monthlyRemaining ?? '—'}{' '}
              <span className="text-xs font-semibold text-slate-400">
                / {syncStatusData?.quota?.monthlyQuota ?? 5000}
              </span>
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {syncStatusData?.quota?.monthlyReset ? `Resets ${formatDate(syncStatusData.quota.monthlyReset)}` : 'Shared company quota'}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200">
            <p className="text-[11px] font-bold uppercase text-indigo-700">API-Synced Departments</p>
            <p className="text-xl font-black text-indigo-900 mt-1">
              {syncStatusData?.syncedCounts?.departments ?? 0}
            </p>
            <p className="text-[10px] text-indigo-600 mt-0.5">
              100% API-driven · {syncStatusData?.syncedCounts?.jobTitles ?? 0} job titles
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
            <p className="text-[11px] font-bold uppercase text-emerald-700">Synced HRMS Staff</p>
            <p className="text-xl font-black text-emerald-900 mt-1">
              {syncStatusData?.syncedCounts?.employees ?? 0}
            </p>
            <p className="text-[10px] text-emerald-600 mt-0.5">
              Webhooks: {syncStatusData?.webhookStats?.processed_events ?? 0} processed /{' '}
              {syncStatusData?.webhookStats?.failed_events ?? 0} failed
            </p>
          </div>
        </div>

        {/* Webhook Endpoint URL Copy Box */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Webhook size={14} className="text-indigo-600" /> Webhook Endpoint URL (Register in OfficePortal UI)
            </p>
            <p className="font-mono text-xs text-slate-600 mt-1 truncate">{webhookUrl}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(webhookUrl);
              setCopiedWebhookUrl(true);
              toast.success('Webhook URL copied to clipboard');
              setTimeout(() => setCopiedWebhookUrl(false), 2000);
            }}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 shrink-0"
          >
            {copiedWebhookUrl ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            {copiedWebhookUrl ? 'Copied' : 'Copy URL'}
          </button>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="field-label text-xs font-bold">Client ID</label>
            <input
              type="text"
              value={formValues.clientId}
              onChange={(e) => setDraftConfig((d) => ({ ...d, clientId: e.target.value }))}
              className="input font-mono text-xs"
              placeholder="Enter OfficePortal Client ID"
            />
          </div>
          <div>
            <label className="field-label text-xs font-bold flex items-center justify-between">
              <span>API Key (Key 1 / Key 2)</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  syncStatusData?.hasClientSecret
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {syncStatusData?.hasClientSecret ? '✓ Configured' : 'Not Set'}
              </span>
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={secretsForm.clientSecret}
              onChange={(e) => setSecretsForm((s) => ({ ...s, clientSecret: e.target.value }))}
              className="input font-mono text-xs"
              placeholder={
                syncStatusData?.hasClientSecret ? '•••••••• (leave blank to keep existing)' : 'Paste OfficePortal Key 1 here'
              }
            />
          </div>
          <div>
            <label className="field-label text-xs font-bold">Token Auth URL</label>
            <input
              type="url"
              value={formValues.authUrl}
              onChange={(e) => setDraftConfig((d) => ({ ...d, authUrl: e.target.value }))}
              className="input font-mono text-xs"
              placeholder="https://accounts.example.com/publicapi/connect/token"
            />
          </div>
          <div>
            <label className="field-label text-xs font-bold">HRMS API Base URL</label>
            <input
              type="url"
              value={formValues.baseUrl}
              onChange={(e) => setDraftConfig((d) => ({ ...d, baseUrl: e.target.value }))}
              className="input font-mono text-xs"
              placeholder="https://publicapi.example.com/employee"
            />
          </div>
          <div>
            <label className="field-label text-xs font-bold flex items-center justify-between">
              <span>Webhook Signing Key (whsec_...)</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  syncStatusData?.hasWebhookSecret
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}
              >
                {syncStatusData?.hasWebhookSecret ? '✓ Configured' : 'Not Set'}
              </span>
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={secretsForm.webhookSecret}
              onChange={(e) => setSecretsForm((s) => ({ ...s, webhookSecret: e.target.value }))}
              className="input font-mono text-xs"
              placeholder={syncStatusData?.hasWebhookSecret ? '•••••••• (leave blank to keep existing)' : 'whsec_...'}
            />
          </div>
          <div>
            <label className="field-label text-xs font-bold flex items-center justify-between">
              <span>Previous Webhook Key (Key Rotation, Optional)</span>
              <span className="flex items-center gap-1.5">
                {syncStatusData?.hasWebhookSecretPrevious && (
                  <button
                    type="button"
                    onClick={() => saveConfigMutation.mutate({ webhookSecretPrevious: '' })}
                    disabled={saveConfigMutation.isPending}
                    className="text-[10px] text-rose-600 hover:text-rose-800 font-bold underline"
                  >
                    Clear
                  </button>
                )}
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    syncStatusData?.hasWebhookSecretPrevious
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  {syncStatusData?.hasWebhookSecretPrevious ? '✓ Set' : 'Optional'}
                </span>
              </span>
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={secretsForm.webhookSecretPrevious}
              onChange={(e) => setSecretsForm((s) => ({ ...s, webhookSecretPrevious: e.target.value }))}
              className="input font-mono text-xs"
              placeholder="whsec_... (previous key during rotation)"
            />
          </div>

          <div className="md:col-span-2 flex items-center justify-between pt-2">
            <p className="text-[11px] text-slate-500">
              Checkpoint: <span className="font-mono">{syncStatusData?.lastChangedAt || 'Not initialized'}</span>
            </p>
            <button
              type="submit"
              disabled={saveConfigMutation.isPending}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {saveConfigMutation.isPending ? <Spinner size={14} className="text-white" /> : <KeyRound size={14} />}
              Save OfficePortal Credentials
            </button>
          </div>
        </form>
      </div>

      {/* Recent Sync Logs */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">Recent Synchronization Runs</h3>
          <span className="text-xs text-slate-500">Scheduled Delta Sync: Every 4 hours (Production)</span>
        </div>
        {isLoadingSyncStatus ? (
          <div className="py-10 flex justify-center">
            <Spinner size={24} />
          </div>
        ) : (syncStatusData?.recentSyncLogs || []).length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-400">No OfficePortal sync runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-3 pl-6">Type</th>
                  <th className="py-3">Status</th>
                  <th className="py-3">Fetched</th>
                  <th className="py-3">Inserted / Updated</th>
                  <th className="py-3">Deactivated</th>
                  <th className="py-3">Completed</th>
                  <th className="py-3 pr-6">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(syncStatusData?.recentSyncLogs || []).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-3 pl-6 font-bold uppercase text-slate-700">{log.sync_type}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : log.status === 'FAILED'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 font-mono">{log.records_fetched ?? 0}</td>
                    <td className="py-3 font-mono">
                      {log.records_inserted ?? 0} / {log.records_updated ?? 0}
                    </td>
                    <td className="py-3 font-mono">{log.records_deactivated ?? 0}</td>
                    <td className="py-3 text-slate-500">
                      {log.completed_at ? formatDateTime(log.completed_at) : 'In progress'}
                    </td>
                    <td className="py-3 pr-6 text-rose-600 max-w-xs truncate" title={log.error_message || ''}>
                      {log.error_message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Incoming Webhook Deliveries */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">Incoming OfficePortal Webhook Events</h3>
          <span className="text-xs text-slate-500">HMAC-SHA256 Verified (whsec_*)</span>
        </div>
        {isWebhookError ? (
          <div className="p-4">
            <Alert type="error" message="Failed to load incoming webhook logs." />
          </div>
        ) : isLoadingWebhookLogs ? (
          <div className="py-10 flex justify-center">
            <Spinner size={24} />
          </div>
        ) : (webhookLogsData?.logs || []).length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-400">No webhook deliveries received yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-3 pl-6">Event Type(s)</th>
                  <th className="py-3">Employee</th>
                  <th className="py-3">Status</th>
                  <th className="py-3">Occurred At</th>
                  <th className="py-3 pr-6">Received At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(webhookLogsData?.logs || []).map((wh) => (
                  <tr key={wh.id} className="hover:bg-slate-50/70">
                    <td className="py-3 pl-6 font-mono text-[11px] text-slate-700 max-w-xs truncate" title={wh.event_type}>
                      {wh.event_type}
                    </td>
                    <td className="py-3 font-medium text-slate-800">
                      {wh.full_name ? `${wh.full_name} (${wh.employee_code || '—'})` : wh.employee_code || '—'}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          wh.status === 'PROCESSED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : wh.status === 'FAILED'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {wh.status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500">{wh.occurred_at ? formatDateTime(wh.occurred_at) : '—'}</td>
                    <td className="py-3 pr-6 text-slate-500">{wh.received_at ? formatDateTime(wh.received_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
