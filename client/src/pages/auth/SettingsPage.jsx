import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { Alert, Spinner } from '../../components/ui';
import { User, Bell, Shield, Info, KeyRound, Lock, Send, Eye, EyeOff, CheckCircle2, AlertCircle, Edit2, Save, X, Phone, MessageSquare, Mail } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user, refreshUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const [whatsappNotif, setWhatsappNotif] = useState(user?.whatsappNotifications ?? true);

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [emailInput, setEmailInput] = useState(user?.email || '');
  const [whatsappInput, setWhatsappInput] = useState(user?.whatsapp || '');
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');

  const updateContactMutation = useMutation({
    mutationFn: (data) => authApi.updateContactInfo(data),
    onSuccess: (res) => {
      toast.success('Contact information updated successfully!');
      if (res?.data?.user) {
        useAuthStore.getState().updateUser(res.data.user);
      }
      refreshUser();
      setIsEditingProfile(false);
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to update contact info');
    }
  });

  const handleStartEdit = () => {
    setEmailInput(user?.email || '');
    setWhatsappInput(user?.whatsapp || '');
    setPhoneInput(user?.phone || '');
    setIsEditingProfile(true);
  };

  const handleSaveContactInfo = (e) => {
    e.preventDefault();
    updateContactMutation.mutate({
      email: emailInput,
      whatsapp: whatsappInput,
      phone: phoneInput
    });
  };

  // Change password state
  const [cpStep, setCpStep] = useState(null); // null | 'confirm' | 'otp'
  const [cpOtp, setCpOtp] = useState('');
  const [cpNewPassword, setCpNewPassword] = useState('');
  const [cpConfirmPassword, setCpConfirmPassword] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const updatePrefMutation = useMutation({
    mutationFn: () => authApi.updateNotificationPrefs({ whatsappNotifications: whatsappNotif }),
    onSuccess: () => {
      toast.success('Preferences saved.');
      refreshUser();
    },
    onError: () => toast.error('Failed to update preferences'),
  });

  const handleRequestCpOtp = async () => {
    setCpLoading(true);
    setCpError('');
    try {
      await authApi.changePasswordOtp();
      toast.success('Verification OTP sent to your email.');
      setCpStep('otp');
    } catch (err) {
      setCpError(err.response?.data?.error || 'Failed to send OTP.');
      toast.error(err.response?.data?.error || 'Failed to send OTP.');
    } finally {
      setCpLoading(false);
    }
  };

  const handleConfirmChangePassword = async (e) => {
    e.preventDefault();
    if (!cpOtp.trim() || !cpNewPassword) {
      setCpError('Please enter OTP and new password.');
      return;
    }
    if (cpNewPassword.length < 6) {
      setCpError('Password must be at least 6 characters.');
      return;
    }
    if (cpConfirmPassword && cpNewPassword !== cpConfirmPassword) {
      setCpError('New password and confirmation do not match.');
      return;
    }
    setCpLoading(true);
    setCpError('');
    try {
      await authApi.employeeResetPassword({
        employeeId: user?.employeeId,
        otp: cpOtp,
        newPassword: cpNewPassword
      });
      setCpStep(null);
      toast.success('Password changed successfully! Please login again.');
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 1500);
    } catch (err) {
      setCpError(err.response?.data?.error || 'Invalid OTP or failed to reset password.');
    } finally {
      setCpLoading(false);
    }
  };

  const roleDescriptions = {
    employee: 'You can report incidents and track their progress.',
    hod: 'You review incidents targeted at your department and provide feedback.',
    imc: 'You review all incidents and manage the knowledge base.',
    head_management: 'You make final decisions on incidents and generate official reports.',
    system_admin: 'You have full access to all system settings, users, and analytics.',
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Account preferences and information</p>
        </div>
      </div>

      {/* Profile card with editable contact info */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-5 border-b border-slate-200">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center flex-shrink-0 shadow-md">
              <span className="font-bold text-xl">{user?.fullName?.charAt(0)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 font-display">{user?.fullName}</h2>
                <span className="badge-blue text-[10px] uppercase font-bold tracking-wider">{user?.role?.replace(/_/g, ' ')}</span>
              </div>
              <p className="text-sm text-slate-500">{user?.designation || 'Hospital Staff'} · {user?.department || 'General'}</p>
              <p className="text-xs font-mono font-semibold text-slate-400 mt-0.5">Emp ID: {user?.employeeId}</p>
            </div>
          </div>

          {!isEditingProfile && (
            <button
              onClick={handleStartEdit}
              className="btn-secondary btn-sm flex items-center justify-center gap-1.5 self-start sm:self-center transition-all hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 font-medium"
            >
              <Edit2 size={14} className="text-blue-600" />
              <span>Edit Contact Info</span>
            </button>
          )}
        </div>

        {isEditingProfile ? (
          <form onSubmit={handleSaveContactInfo} className="space-y-4 pt-1">
            <div className="bg-blue-50 border border-blue-200/80 rounded-xl p-3 text-xs text-blue-800 flex items-start gap-2.5">
              <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <span>
                You can update your registered Email Address and WhatsApp Number below. These details will be used for system notifications and verification OTPs.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Mail size={14} className="text-slate-500" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="e.g. employee@hospital.com"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-slate-900 outline-none text-sm transition-all shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-emerald-600" />
                  WhatsApp Number
                </label>
                <input
                  type="text"
                  value={whatsappInput}
                  onChange={(e) => setWhatsappInput(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-emerald-500 rounded-xl text-slate-900 outline-none text-sm transition-all shadow-sm font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Phone size={14} className="text-slate-500" />
                  Phone Number
                </label>
                <input
                  type="text"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="e.g. 9876543210 (Optional if same as WhatsApp)"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-slate-900 outline-none text-sm transition-all shadow-sm font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateContactMutation.isPending}
                className="btn bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-70"
              >
                {updateContactMutation.isPending ? <Spinner size={14} className="text-white" /> : <Save size={14} />}
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <div className="py-2 border-b border-slate-100 flex justify-between sm:block">
                <span className="text-xs font-medium text-slate-400 block mb-0.5">Full Name</span>
                <span className="text-slate-800 font-semibold">{user?.fullName || '—'}</span>
              </div>
              <div className="py-2 border-b border-slate-100 flex justify-between sm:block">
                <span className="text-xs font-medium text-slate-400 block mb-0.5">Employee ID</span>
                <span className="font-mono text-slate-800 font-bold">{user?.employeeId || '—'}</span>
              </div>
              <div className="py-2 border-b border-slate-100 flex justify-between sm:block">
                <span className="text-xs font-medium text-slate-400 block mb-0.5">Department</span>
                <span className="text-slate-800 font-medium">{user?.department || '—'}</span>
              </div>
              <div className="py-2 border-b border-slate-100 flex justify-between sm:block">
                <span className="text-xs font-medium text-slate-400 block mb-0.5">Role</span>
                <span className="badge-blue inline-block mt-0.5 capitalize">{user?.role?.replace(/_/g, ' ')}</span>
              </div>
              <div className="py-2 border-b sm:border-b-0 border-slate-100 flex justify-between sm:block">
                <span className="text-xs font-medium text-slate-400 block mb-0.5">Email Address</span>
                <span className="text-slate-800 font-medium break-all">
                  {user?.email ? (
                    <span className="flex items-center gap-1.5">
                      <Mail size={13} className="text-blue-600 flex-shrink-0" />
                      {user.email}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Not provided</span>
                  )}
                </span>
              </div>
              <div className="py-2 border-b sm:border-b-0 border-slate-100 flex justify-between sm:block">
                <span className="text-xs font-medium text-slate-400 block mb-0.5">WhatsApp Number</span>
                <span className="font-mono text-slate-800 font-medium">
                  {user?.whatsapp ? (
                    <span className="flex items-center gap-1.5">
                      <MessageSquare size={13} className="text-emerald-600 flex-shrink-0" />
                      {user.whatsapp}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic font-sans">Not provided</span>
                  )}
                </span>
              </div>
              <div className="py-2 flex justify-between sm:block sm:col-span-2">
                <span className="text-xs font-medium text-slate-400 block mb-0.5">Phone Number</span>
                <span className="font-mono text-slate-800 font-medium">
                  {user?.phone ? (
                    <span className="flex items-center gap-1.5">
                      <Phone size={13} className="text-slate-600 flex-shrink-0" />
                      {user.phone}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic font-sans">Not provided</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Role info */}
      <div className="card p-5 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Shield size={17} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Your Role: {user?.role?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3>
            <p className="text-sm text-slate-600">{roleDescriptions[user?.role] || ''}</p>
          </div>
        </div>
      </div>

      {/* Account Security / Change Password */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0">
              <KeyRound size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Account Security</h2>
              <p className="text-xs text-slate-500">Manage your login password and account verification</p>
            </div>
          </div>
          {cpStep !== null && (
            <button
              onClick={() => { setCpStep(null); setCpError(''); setCpOtp(''); setCpNewPassword(''); setCpConfirmPassword(''); }}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium"
            >
              Cancel
            </button>
          )}
        </div>

        {cpError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-xs text-red-700">
            <AlertCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
            <span>{cpError}</span>
          </div>
        )}

        {cpStep === null && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-800">Change Account Password</p>
              <p className="text-xs text-slate-500 mt-0.5">
                We will send a verification code to your registered email address before resetting your password.
              </p>
            </div>
            <button
              onClick={() => { setCpStep('confirm'); setCpError(''); }}
              className="btn bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-all flex-shrink-0 shadow-sm"
            >
              <Lock size={15} />
              Change Password
            </button>
          </div>
        )}

        {cpStep === 'confirm' && (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
            <p className="text-sm text-slate-700">
              Are you sure you want to change your account password? A 6-digit verification code will be sent to <strong>{user?.email || 'your registered email'}</strong>.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setCpStep(null)}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRequestCpOtp}
                disabled={cpLoading}
                className="btn bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm disabled:opacity-70"
              >
                {cpLoading ? <Spinner size={14} className="text-white" /> : <Send size={14} />}
                Send Verification Code
              </button>
            </div>
          </div>
        )}

        {cpStep === 'otp' && (
          <form onSubmit={handleConfirmChangePassword} className="space-y-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-xs text-slate-600">
              Enter the 6-digit verification code sent to your registered email and set a new password below.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Verification OTP</label>
              <input
                value={cpOtp}
                onChange={(e) => setCpOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none text-sm font-mono tracking-[0.25em] text-center font-bold"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={cpNewPassword}
                    onChange={(e) => setCpNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={cpConfirmPassword}
                  onChange={(e) => setCpConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setCpStep(null)}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={cpLoading || cpOtp.length !== 6 || !cpNewPassword}
                className="btn bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm disabled:opacity-70"
              >
                {cpLoading ? <Spinner size={14} className="text-white" /> : <CheckCircle2 size={14} />}
                Update Password & Re-Login
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Notification prefs */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={17} className="text-slate-600" />
          <h2 className="text-sm font-semibold text-slate-800">Notification Preferences</h2>
        </div>

        <div className="flex items-center justify-between py-3 border-b border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-800">WhatsApp Notifications</p>
            <p className="text-xs text-slate-500 mt-0.5">Receive incident updates via WhatsApp</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={whatsappNotif}
              onChange={e => setWhatsappNotif(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => updatePrefMutation.mutate()}
            disabled={updatePrefMutation.isPending}
            className="btn-primary btn-sm"
          >
            Save Preferences
          </button>
        </div>
      </div>


    </div>
  );
}
