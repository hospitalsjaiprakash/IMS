import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { Alert, Spinner } from '../../components/ui';
import { Settings, Save, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const CONFIG_FIELDS = [
  {
    key: 'sla_days',
    label: 'SLA Resolution Days',
    description: 'Number of days before an incident is flagged as overdue.',
    type: 'number',
    min: 1, max: 30,
  },
  {
    key: 'parallel_grave_review',
    label: 'Parallel HOD+IMC Feedback for Grave Incidents',
    description: 'When enabled, Grave severity incidents skip straight to simultaneous HOD and IMC feedback.',
    type: 'boolean',
  },
  {
    key: 'data_retention_years',
    label: 'Data Retention (years)',
    description: 'How long resolved incident data is kept before archiving.',
    type: 'number',
    min: 1, max: 10,
  },
  {
    key: 'withdrawn_retention_years',
    label: 'Withdrawn Incident Retention (years)',
    description: 'How long withdrawn incidents are kept before purging.',
    type: 'number',
    min: 1, max: 5,
  },
];

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const [localConfig, setLocalConfig] = useState({});
  const [dirty, setDirty] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => adminApi.getConfig().then(r => r.data),
  });

  useEffect(() => {
    if (config) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalConfig(config);
      setDirty(false);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: (data) => adminApi.updateConfig(data),
    onSuccess: () => {
      toast.success('System configuration saved successfully.');
      qc.invalidateQueries({ queryKey: ['admin-config'] });
      setDirty(false);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to save configuration'),
  });

  const handleChange = (key, value) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleReset = () => {
    setLocalConfig(config);
    setDirty(false);
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Spinner size={32} /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">System Settings</h1>
          <p className="page-subtitle">Configure IMS operational parameters</p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <button onClick={handleReset} className="btn-secondary">
              <RefreshCw size={15} />
              Reset
            </button>
          )}
          <button
            onClick={() => saveMutation.mutate(localConfig)}
            disabled={!dirty || saveMutation.isPending}
            className="btn-primary"
          >
            {saveMutation.isPending ? <Spinner size={15} className="text-white" /> : <Save size={15} />}
            Save Changes
          </button>
        </div>
      </div>

      {dirty && (
        <Alert type="warning" title="Unsaved Changes" message="You have unsaved configuration changes. Click Save to apply." />
      )}

      <div className="card divide-y divide-slate-200">
        {CONFIG_FIELDS.map(field => (
          <div key={field.key} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Settings size={14} className="text-slate-400 flex-shrink-0" />
                <p className="text-sm font-semibold text-slate-800">{field.label}</p>
              </div>
              <p className="text-xs text-slate-500 mt-1 ml-5">{field.description}</p>
            </div>
            <div className="flex-shrink-0 sm:w-36">
              {field.type === 'boolean' ? (
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localConfig[field.key] === 'true'}
                    onChange={e => handleChange(field.key, e.target.checked ? 'true' : 'false')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-2 text-sm text-slate-600">
                    {localConfig[field.key] === 'true' ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              ) : (
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  value={localConfig[field.key] || ''}
                  onChange={e => handleChange(field.key, e.target.value)}
                  className="input text-center font-mono"
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Configuration Notes</h3>
        <ul className="space-y-1.5 text-xs text-slate-500 list-disc list-inside">
          <li>All configuration changes are logged in the audit trail with the administrator's name.</li>
          <li>SLA settings take effect immediately for existing active incidents.</li>
          <li>Data retention settings apply to the nightly archival job.</li>
          <li>Contact your system administrator before changing critical settings.</li>
        </ul>
      </div>
    </div>
  );
}
