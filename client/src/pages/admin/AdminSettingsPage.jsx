import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { Alert, Spinner } from '../../components/ui';
import { Settings, Save, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '../../utils/helpers';
import { useAuthStore } from '../../store/authStore';

const CONFIG_FIELDS = [
  {
    key: 'hod_reminder_1_days',
    label: 'Department Feedback 1st Reminder (Days)',
    description: 'Send the first automated reminder email to assigned category feedback staff (Default: 5 days)',
    type: 'number',
    min: 1,
    max: 30,
  },
  {
    key: 'hod_reminder_2_days',
    label: 'Department Feedback Final Deadline (Days)',
    description: 'Deadline to provide department feedback; sends final reminder (Default: 7 days)',
    type: 'number',
    min: 1,
    max: 30,
  },
  {
    key: 'hod_escalation_1_days',
    label: 'Department Feedback Overdue Reminder (Days)',
    description: 'Sends an overdue notification to assigned category feedback staff (Default: 14 days)',
    type: 'number',
    min: 1,
    max: 60,
  },
  {
    key: 'hod_escalation_2_days',
    label: 'Department Feedback Escalation to IMC (Days)',
    description: 'Escalates overdue incident feedback to the IMC committee (Default: 21 days)',
    type: 'number',
    min: 1,
    max: 60,
  },
  {
    key: 'hod_escalation_3_days',
    label: 'Department Feedback Escalation to Mgmt & IMC (Days)',
    description: 'Escalates long-overdue feedback to Management and IMC (Default: 28 days)',
    type: 'number',
    min: 1,
    max: 90,
  },
  {
    key: 'imc_feedback_days',
    label: 'IMC Feedback Time Limit (Days)',
    description: 'Maximum days allowed for IMC to provide feedback after department feedback is completed.',
    type: 'number',
    min: 1,
    max: 30,
  },
  {
    key: 'mgmt_feedback_days',
    label: 'Management Feedback Time Limit (Days)',
    description: 'Maximum days allowed for Management to act after IMC submits its assessment.',
    type: 'number',
    min: 1,
    max: 30,
  },
  {
    key: 'auto_reminder_days',
    label: 'Auto-Reminder Frequency (Days)',
    description: 'How often the system sends automated reminders for pending feedback.',
    type: 'number',
    min: 1,
    max: 14,
  },
  {
    key: 'otp_validity_minutes',
    label: 'OTP Validity Duration (Minutes)',
    description: 'How long an OTP remains valid for signup or password recovery.',
    type: 'number',
    min: 1,
    max: 60,
  },
  {
    key: 'email_notifications_enabled',
    label: 'Email Notifications',
    description:
      'Enable or disable general system email notifications. When disabled, incident alerts and reminders stop, while authentication emails (signup, OTP, password reset) still deliver.',
    type: 'boolean',
    default: true,
  },
  {
    key: 'maintenance_mode',
    label: 'Maintenance Mode',
    description: 'When enabled, staff cannot report new incidents (system maintenance banner active).',
    type: 'boolean',
    default: false,
  },
];

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const { refreshUser } = useAuthStore();
  const [draftConfig, setDraftConfig] = useState({});

  const { data: config, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => adminApi.getConfig().then((r) => r.data || {}),
  });

  const localConfig = useMemo(() => {
    const merged = { ...(config || {}), ...draftConfig };
    CONFIG_FIELDS.forEach((f) => {
      if (f.type === 'boolean' && (merged[f.key] === undefined || merged[f.key] === null)) {
        merged[f.key] = f.default ? 'true' : 'false';
      }
    });
    return merged;
  }, [config, draftConfig]);

  const dirty = Object.keys(draftConfig).length > 0;

  const saveMutation = useMutation({
    mutationFn: (data) => adminApi.updateConfig(data),
    onSuccess: () => {
      toast.success('System configuration saved successfully.');
      setDraftConfig({});
      qc.invalidateQueries({ queryKey: ['admin-config'] });
      if (typeof refreshUser === 'function') refreshUser();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to save configuration')),
  });

  const handleChange = (key, value) => {
    setDraftConfig((prev) => ({ ...prev, [key]: value }));
  };

  const isFieldEnabled = (field) => {
    const val = localConfig[field.key];
    if (val === undefined || val === null || val === '') return field.default ?? false;
    return val === 'true' || val === true || val === 1 || val === '1';
  };

  const handleSave = () => {
    for (const f of CONFIG_FIELDS) {
      if (f.type === 'number') {
        const raw = localConfig[f.key];
        const num = Number(raw);
        if (raw === '' || Number.isNaN(num) || num < f.min || num > f.max) {
          toast.error(`${f.label} must be between ${f.min} and ${f.max}.`);
          return;
        }
      }
    }
    saveMutation.mutate(localConfig);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-2xl space-y-4">
        <Alert type="error" title="Error" message="Failed to load system settings." />
        <button type="button" onClick={() => refetch()} className="btn-secondary inline-flex items-center gap-2">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 pb-12">
      <div className="page-header">
        <div>
          <h1 className="page-title">System Settings</h1>
          <p className="page-subtitle">Configure IMS SLA deadlines and operational parameters</p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <button type="button" onClick={() => setDraftConfig({})} className="btn-secondary inline-flex items-center gap-1.5">
              <RefreshCw size={15} />
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saveMutation.isPending}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            {saveMutation.isPending ? <Spinner size={15} className="text-white" /> : <Save size={15} />}
            Save Changes
          </button>
        </div>
      </div>

      {dirty && (
        <Alert
          type="warning"
          title="Unsaved Changes"
          message="You have unsaved configuration changes. Click Save Changes to apply."
        />
      )}

      <div className="card divide-y divide-slate-200">
        {CONFIG_FIELDS.map((field) => (
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
                      onClick={() => handleChange(field.key, isEnabled ? 'false' : 'true')}
                      className="inline-flex items-center gap-3 cursor-pointer focus:outline-none select-none py-1"
                    >
                      <span
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          isEnabled ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                            isEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </span>
                      <span
                        className={`text-sm font-semibold min-w-[60px] text-left ${
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
                  onChange={(e) => handleChange(field.key, e.target.value)}
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
