import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { Spinner, SkeletonDetail } from '../../components/ui';
import {
  Shield,
  Info,
  KeyRound,
  Lock,
  Send,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Phone,
  Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user, refreshUser, clearLocalSession, updateSession } = useAuthStore();
  const navigate = useNavigate();

  const isRootAdmin = String(user?.employeeId || '').trim() === '00000';

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  // Root System Admin (00000) 2-step Recovery Email Change state (Current Password + OTP)
  const [emailStep, setEmailStep] = useState(null); // null | 'request' | 'verify'
  const [newEmailInput, setNewEmailInput] = useState('');
  const [currentPwdInput, setCurrentPwdInput] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  const resetEmailForm = () => {
    setEmailStep(null);
    setNewEmailInput('');
    setCurrentPwdInput('');
    setEmailOtpInput('');
    setEmailError('');
    setShowCurrentPwd(false);
  };

  const handleRequestAdminEmailOtp = async (e) => {
    e.preventDefault();
    const trimmedEmail = newEmailInput.trim();
    if (!currentPwdInput || !trimmedEmail) {
      setEmailError('Please enter your current password and new recovery email address.');
      return;
    }
    setEmailLoading(true);
    setEmailError('');
    try {
      const res = await authApi.requestAdminEmailOtp({
        currentPassword: currentPwdInput,
        newEmail: trimmedEmail,
      });
      toast.success(res.data?.message || 'Verification OTP sent to your new recovery email.');
      setEmailStep('verify');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to send verification OTP.';
      setEmailError(msg);
      toast.error(msg);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyAdminEmailChange = async (e) => {
    e.preventDefault();
    if (!emailOtpInput.trim() || emailOtpInput.trim().length !== 6) {
      setEmailError('Please enter the 6-digit verification OTP sent to your new email.');
      return;
    }
    setEmailLoading(true);
    setEmailError('');
    try {
      const res = await authApi.updateContactInfo({
        newEmail: newEmailInput.trim(),
        currentPassword: currentPwdInput,
        otp: emailOtpInput.trim(),
      });
      if (res?.data?.token || res?.data?.user) {
        updateSession(res.data.token, res.data.user);
      }
      await refreshUser();
      toast.success('Recovery email updated! Other active sessions have been signed out.');
      resetEmailForm();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to update recovery email.';
      setEmailError(msg);
      toast.error(msg);
    } finally {
      setEmailLoading(false);
    }
  };

  // Change password state
  const [cpStep, setCpStep] = useState(null); // null | 'confirm' | 'otp'
  const [cpOtp, setCpOtp] = useState('');
  const [cpNewPassword, setCpNewPassword] = useState('');
  const [cpConfirmPassword, setCpConfirmPassword] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const handleRequestCpOtp = async () => {
    setCpLoading(true);
    setCpError('');
    try {
      await authApi.changePasswordOtp();
      toast.success('Verification OTP sent to your email.');
      setCpStep('otp');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to send OTP.';
      setCpError(msg);
      toast.error(msg);
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
    if (
      cpNewPassword.length < 6 ||
      !/[A-Za-z]/.test(cpNewPassword) ||
      !/([0-9]|[^A-Za-z0-9])/.test(cpNewPassword)
    ) {
      setCpError('Password must be at least 6 characters and include at least one letter and one number or special character.');
      return;
    }
    if (new TextEncoder().encode(cpNewPassword).length > 72) {
      setCpError('Password must not exceed 72 bytes.');
      return;
    }
    if (!cpConfirmPassword || cpNewPassword !== cpConfirmPassword) {
      setCpError('Please confirm your new password — both password fields must match.');
      return;
    }
    setCpLoading(true);
    setCpError('');
    try {
      await authApi.employeeResetPassword({
        employeeId: user?.employeeId,
        otp: cpOtp,
        newPassword: cpNewPassword,
      });
      setCpStep(null);
      setCpOtp('');
      setCpNewPassword('');
      setCpConfirmPassword('');
      toast.success('Password changed successfully! Please login again.');
      // Server already bumped token_version on password reset; clear local session immediately
      // to avoid racing with background polls or issuing a redundant /auth/logout call.
      clearLocalSession({ broadcast: true });
      navigate('/login', { replace: true });
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

  if (isLoading) return <SkeletonDetail />;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Account preferences and information</p>
        </div>
      </div>

      {/* Profile card (HRMS-managed read-only for employees; Password+OTP recovery email update for root 00000 only) */}
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

          {isRootAdmin && emailStep === null && (
            <button
              type="button"
              onClick={() => {
                setEmailError('');
                setNewEmailInput('');
                setCurrentPwdInput('');
                setEmailOtpInput('');
                setEmailStep('request');
              }}
              className="btn-secondary btn-sm flex items-center justify-center gap-1.5 self-start sm:self-center transition-all hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 font-medium"
            >
              <Edit2 size={14} className="text-blue-600" />
              <span>Update Recovery Email</span>
            </button>
          )}
        </div>

        {isRootAdmin && emailStep !== null ? (
          <div className="space-y-4 pt-1">
            {emailError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                <AlertCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
                <span>{emailError}</span>
              </div>
            )}

            {emailStep === 'request' && (
              <form onSubmit={handleRequestAdminEmailOtp} className="space-y-4">
                <div className="bg-blue-50 border border-blue-200/80 rounded-xl p-3 text-xs text-blue-800 flex items-start gap-2.5">
                  <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                  <span>
                    To update the root System Admin recovery email, verify your current password first. A 6-digit OTP will be sent to the new email address before saving.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Lock size={14} className="text-slate-500" />
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPwd ? 'text' : 'password'}
                        value={currentPwdInput}
                        onChange={(e) => { setCurrentPwdInput(e.target.value); setEmailError(''); }}
                        placeholder="Enter current password"
                        autoComplete="current-password"
                        className="w-full px-3.5 py-2.5 pr-10 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-slate-900 outline-none text-sm transition-all shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showCurrentPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Mail size={14} className="text-slate-500" />
                      New Recovery Email
                    </label>
                    <input
                      type="email"
                      value={newEmailInput}
                      onChange={(e) => { setNewEmailInput(e.target.value); setEmailError(''); }}
                      placeholder="e.g. admin-recovery@jphrc.org"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-slate-900 outline-none text-sm transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                  <button type="button" onClick={resetEmailForm} className="btn-secondary btn-sm">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={emailLoading || !currentPwdInput || !newEmailInput.trim()}
                    className="btn bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-70"
                  >
                    {emailLoading ? <Spinner size={14} className="text-white" /> : <Send size={14} />}
                    Send Verification OTP
                  </button>
                </div>
              </form>
            )}

            {emailStep === 'verify' && (
              <form onSubmit={handleVerifyAdminEmailChange} className="space-y-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-xs text-slate-600">
                  Enter the 6-digit verification code sent to <strong>{newEmailInput.trim()}</strong> to confirm updating your recovery email. All other active sessions will be signed out.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Verification OTP</label>
                  <input
                    value={emailOtpInput}
                    onChange={(e) => { setEmailOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setEmailError(''); }}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-slate-900 outline-none text-sm font-mono tracking-[0.25em] text-center font-bold"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <button type="button" onClick={resetEmailForm} className="btn-secondary btn-sm">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={emailLoading || emailOtpInput.length !== 6}
                    className="btn bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-70"
                  >
                    {emailLoading ? <Spinner size={14} className="text-white" /> : <CheckCircle2 size={14} />}
                    Verify &amp; Save Recovery Email
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            {!isRootAdmin && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-600 flex items-center gap-2">
                <Info size={14} className="text-slate-500 flex-shrink-0" />
                <span>Synced from OfficePortal HRMS — contact HR to update your email or phone number.</span>
              </div>
            )}
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
                <span className="text-xs font-medium text-slate-400 block mb-0.5">
                  {isRootAdmin ? 'Recovery Email Address' : 'Official Email Address'}
                </span>
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
                    placeholder="Min 6 chars (letter + number/symbol)"
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
                disabled={cpLoading || cpOtp.length !== 6 || !cpNewPassword || !cpConfirmPassword}
                className="btn bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm disabled:opacity-70"
              >
                {cpLoading ? <Spinner size={14} className="text-white" /> : <CheckCircle2 size={14} />}
                Update Password &amp; Re-Login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
