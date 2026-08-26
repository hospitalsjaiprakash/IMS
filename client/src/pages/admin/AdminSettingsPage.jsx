import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { Alert, Spinner } from '../../components/ui';
import { Settings, Save, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const CONFIG_FIELDS = [

  {
    key: 'hod_feedback_days',
    label: 'HOD Feedback Time Limit (Days)',
    description: 'Maximum days allowed for HOD to provide feedback after an incident is reported.',
    type: 'number',
    min: 1, max: 30,
  },
  {
    key: 'imc_feedback_days',
    label: 'IMC Feedback Time Limit (Days)',
    description: 'Maximum days allowed for IMC to provide feedback after HOD feedback on that incident.',
    type: 'number',
    min: 1, max: 30,
  },
  {
    key: 'mgmt_feedback_days',
    label: 'Management Feedback Time Limit (Days)',
    description: 'Maximum days allowed for Management to provide feedback after IMC provides feedback.',
    type: 'number',
    min: 1, max: 30,
  },
  {
    key: 'auto_reminder_days',
    label: 'Auto-Reminder Frequency (Days)',
    description: 'How often the system sends automated reminders for pending feedback.',
    type: 'number',
    min: 1, max: 14,
  },
  {
    key: 'otp_validity_minutes',
    label: 'OTP Validity Duration (Minutes)',
    description: 'How long an OTP is valid for login or role actions.',
    type: 'number',
    min: 1, max: 60,
  },
  {
    key: 'maintenance_mode',
    label: 'Maintenance Mode',
    description: 'When enabled, users cannot report new incidents (System under maintenance).',
    type: 'boolean',
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


    </div>
  );
}
