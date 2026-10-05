import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { Alert, Spinner } from '../../components/ui';
import { Settings, Save, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const CONFIG_FIELDS = [
  {
    key: 'hod_reminder_1_days',
    label: 'HOD 1st Reminder (Days)',
    description: 'Send the first automated reminder email to HOD (Default: 5 days)',
    type: 'number',
    min: 1, max: 30,
  },
  {
    key: 'hod_reminder_2_days',
    label: 'HOD Last Day Deadline (Days)',
    description: 'Deadline to provide feedback, sends final reminder (Default: 7 days)',
    type: 'number',
    min: 1, max: 30,
  },
  {
    key: 'hod_escalation_1_days',
    label: 'HOD Overdue Reminder (Days)',
    description: 'Sends an overdue notification to the HOD (Default: 14 days)',
    type: 'number',
    min: 1, max: 60,
  },
  {
    key: 'hod_escalation_2_days',
    label: 'HOD Escalation to IMC (Days)',
    description: 'Escalates the pending incident to the IMC committee (Default: 21 days)',
    type: 'number',
    min: 1, max: 60,
  },
  {
    key: 'hod_escalation_3_days',
    label: 'HOD Escalation to Mgmt & IMC (Days)',
    description: 'Escalates the incident to Management and IMC (Default: 28 days)',
    type: 'number',
    min: 1, max: 90,
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
    key: 'email_notifications_enabled',
    label: 'Email Notifications',
    description: 'Enable or disable general system email notifications. When disabled, incident alerts, reminders, and updates are stopped. Essential authentication emails (signup, password reset, security OTPs) continue to function normally.',
    type: 'boolean',
    default: true,
  },
  {
    key: 'maintenance_mode',
    label: 'Maintenance Mode',
    description: 'When enabled, users cannot report new incidents (System under maintenance).',
    type: 'boolean',
    default: false,
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
      const merged = { ...config };
      CONFIG_FIELDS.forEach(f => {
        if (f.type === 'boolean' && (merged[f.key] === undefined || merged[f.key] === null)) {
          merged[f.key] = f.default ? 'true' : 'false';
        }
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalConfig(merged);
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

  const isFieldEnabled = (field) => {
    const val = localConfig[field.key];
    if (val === undefined || val === null || val === '') {
      return field.default ?? false;
    }
    return val === 'true' || val === true || val === 1 || val === '1';
  };

  const handleToggle = (field) => {
    const currentVal = isFieldEnabled(field);
    const nextVal = currentVal ? 'false' : 'true';
    handleChange(field.key, nextVal);
  };

  const handleReset = () => {
    const merged = { ...(config || {}) };
    CONFIG_FIELDS.forEach(f => {
      if (f.type === 'boolean' && (merged[f.key] === undefined || merged[f.key] === null)) {
        merged[f.key] = f.default ? 'true' : 'false';
      }
    });
    setLocalConfig(merged);
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
            <div className="flex-shrink-0 sm:w-36 flex items-center sm:justify-end">
              {field.type === 'boolean' ? (
                (() => {
                  const isEnabled = isFieldEnabled(field);
                  return (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      onClick={() => handleToggle(field)}
                      className="inline-flex items-center gap-3 cursor-pointer group focus:outline-none select-none py-1"
                    >
                      <span
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isEnabled ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            isEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </span>
                      <span
                        className={`text-sm font-semibold transition-colors duration-150 min-w-[60px] text-left ${
                          isEnabled ? 'text-blue-600' : 'text-slate-500'
                        }`}
                      >
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </button>
                  );
                })()
              ) : (
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  value={localConfig[field.key] ?? ''}
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
