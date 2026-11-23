import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authApi, pingServer } from '../../api';
import { AlertCircle, CheckCircle2, UserPlus, LogIn, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Spinner } from '../../components/ui';
import { getRoleDashboard, validatePassword, getApiErrorMessage } from '../../utils/helpers';

import jphBuildImg from '../../assets/JPHBUILD.webp';
import logoImg from '../../assets/logo.webp';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register, requestRegistrationOtp, loading } = useAuthStore();
  const bgRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!bgRef.current) return;
    const { clientX, clientY } = e;
    const moveX = (clientX / window.innerWidth - 0.5) * 60;
    const moveY = (clientY / window.innerHeight - 0.5) * 60;
    bgRef.current.style.transform = `translate(${moveX}px, ${moveY}px)`;
  };

  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'register_otp' | 'forgot' | 'forgot_otp'
  const [localLoading, setLocalLoading] = useState(false);
  const [serverSlow, setServerSlow] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  useEffect(() => {
    pingServer();
  }, []);

  const [loginForm, setLoginForm] = useState({ employeeId: '', password: '' });
  const [regForm, setRegForm] = useState({ fullName: '', employeeId: '', email: '', password: '', otp: '' });
  const [forgotForm, setForgotForm] = useState({ employeeId: '', email: '', otp: '', newPassword: '' });

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLoginChange = (e) => {
    setLoginForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
    setSuccessMsg('');
  };

  const handleRegChange = (e) => {
    setRegForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
    setSuccessMsg('');
  };

  const handleForgotChange = (e) => {
    setForgotForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
    setSuccessMsg('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginForm.employeeId.trim() || !loginForm.password) {
      setError('Employee ID and password are required.');
      return;
    }
    setServerSlow(false);
    const slowTimer = setTimeout(() => setServerSlow(true), 8000);
    const result = await login(loginForm);
    clearTimeout(slowTimer);
    setServerSlow(false);

    if (result.success) {
      navigate(getRoleDashboard(result.user));
    } else {
      const isTimeout =
        result.error?.toLowerCase().includes('timeout') ||
        result.error?.toLowerCase().includes('network') ||
        result.error?.toLowerCase().includes('failed');
      setError(
        isTimeout
          ? 'Unable to reach the server right now. Please check your connection and try again.'
          : result.error
      );
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!regForm.fullName.trim() || !regForm.employeeId.trim() || !regForm.email.trim() || !regForm.password) {
      setError('Full Name, Employee ID, Email, and Password are required.');
      return;
    }
    const pwCheck = validatePassword(regForm.password);
    if (!pwCheck.valid) {
      setError(pwCheck.error);
      return;
    }
    const result = await requestRegistrationOtp(regForm);
    if (result.success) {
      setSuccessMsg(result.message || 'Verification OTP sent to your official HRMS email address.');
      setMode('register_otp');
    } else if (result.code === 'OTP_COOLDOWN' && result.retryAfterSeconds) {
      setError(`Please wait ${result.retryAfterSeconds} seconds before requesting another OTP.`);
    } else {
      setError(result.error);
    }
  };

  const handleVerifyRegOtpSubmit = async (e) => {
    e.preventDefault();
    if (!regForm.otp.trim()) {
      setError('Please enter the OTP sent to your email.');
      return;
    }
    const result = await register(regForm);
    if (result.success) {
      setSuccessMsg(result.message || 'Account created successfully! Please log in with your credentials.');
      setMode('login');
      setLoginForm({ employeeId: regForm.employeeId, password: regForm.password });
    } else {
      setError(result.error);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotForm.employeeId.trim() || !forgotForm.email.trim()) {
      setError('Please enter your Employee ID and Email address.');
      return;
    }
    setLocalLoading(true);
    setError('');
    try {
      const res = await authApi.employeeForgotPassword({
        employeeId: forgotForm.employeeId,
        email: forgotForm.email,
      });
      setSuccessMsg(
        res.data.message ||
          'If your details match an active registered account, a verification OTP has been sent to the registered email.'
      );
      setMode('forgot_otp');
    } catch (err) {
      const status = err.response?.status;
      const code = err.response?.data?.code;
      const retryAfter = err.response?.data?.retryAfterSeconds;
      if (status === 429 && code === 'OTP_COOLDOWN' && retryAfter) {
        setError(`Please wait ${retryAfter} seconds before requesting another OTP.`);
      } else {
        setError(getApiErrorMessage(err, 'Unable to process password reset request right now. Please try again.'));
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!forgotForm.otp.trim() || !forgotForm.newPassword) {
      setError('Please enter the OTP and your new password.');
      return;
    }
    const pwCheck = validatePassword(forgotForm.newPassword);
    if (!pwCheck.valid) {
      setError(pwCheck.error);
      return;
    }
    setLocalLoading(true);
    setError('');
    try {
      const res = await authApi.employeeResetPassword({
        employeeId: forgotForm.employeeId,
        otp: forgotForm.otp,
        newPassword: forgotForm.newPassword,
      });
      setSuccessMsg(res.data.message || 'Password reset successfully! Please log in.');
      setMode('login');
      setLoginForm({ employeeId: forgotForm.employeeId, password: '' });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to reset password. Please check your OTP.'));
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      <div className="hidden lg:flex lg:w-[65%] relative bg-green-900 overflow-hidden">
        <img
          src={jphBuildImg}
          alt="Jaiprakash Hospital Building"
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-green-900/80 to-transparent" />
        <div className="relative z-10 flex flex-col justify-end p-16 w-full text-white">
          <p className="text-5xl lg:text-7xl font-bold font-display mb-6 tracking-tight text-white drop-shadow-lg">
            WELCOME TO THE IMS
          </p>
          <p className="text-3xl font-bold font-display mb-2 text-white/90">
            Jaiprakash Hospital &amp; Research Centre
          </p>
          <p className="text-green-50 text-lg italic">Quality Healthcare at Affordable Price</p>
        </div>
      </div>

      <div
        className="w-full lg:w-[35%] flex flex-col relative bg-white overflow-y-auto overflow-x-hidden"
        onMouseMove={handleMouseMove}
      >
        <div
          ref={bgRef}
          className="absolute inset-[-100px] z-0 pointer-events-none transition-transform duration-100 ease-out"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='14' cy='18' r='1' fill='%2386efac'/%3E%3Ccircle cx='54' cy='38' r='1.5' fill='%23bae6fd'/%3E%3Ccircle cx='96' cy='22' r='1' fill='%2322c55e'/%3E%3Ccircle cx='34' cy='78' r='1' fill='%2386efac'/%3E%3Ccircle cx='106' cy='94' r='1.5' fill='%23e0f2fe'/%3E%3Ccircle cx='72' cy='106' r='1' fill='%234ade80'/%3E%3Ccircle cx='110' cy='50' r='1' fill='%2386efac'/%3E%3Ccircle cx='26' cy='106' r='1.5' fill='%23bae6fd'/%3E%3Ccircle cx='66' cy='14' r='1' fill='%2322c55e'/%3E%3Ccircle cx='18' cy='58' r='1' fill='%2386efac'/%3E%3Ccircle cx='85' cy='65' r='1' fill='%234ade80'/%3E%3Ccircle cx='45' cy='95' r='1.2' fill='%23bbf7d0'/%3E%3C/svg%3E")`,
            backgroundSize: '120px 120px',
            opacity: 0.8,
          }}
        />

        <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative z-10">
          <div className="w-full max-w-[400px]">
            <div className="text-center mb-8">
              <img src={logoImg} alt="JPHRC Logo" className="h-28 w-auto mx-auto mb-6 drop-shadow-sm" />
              <h1 className="text-2xl font-bold text-slate-900 font-display tracking-tight">IMS PORTAL</h1>
              <p className="text-sm text-slate-500 mt-1">Incident Management System</p>
            </div>

            {mode === 'login' || mode === 'register' ? (
              <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setSuccessMsg('');
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                    mode === 'login' ? 'bg-white text-green-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LogIn size={16} className={mode === 'login' ? 'text-green-700' : 'text-slate-400'} />
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                    setSuccessMsg('');
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                    mode === 'register' ? 'bg-white text-green-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserPlus size={16} className={mode === 'register' ? 'text-green-700' : 'text-slate-400'} />
                  Create Account
                </button>
              </div>
            ) : mode === 'register_otp' ? (
              <div className="mb-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                    setSuccessMsg('');
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:text-green-800"
                >
                  <ArrowLeft size={16} /> Back to Sign Up
                </button>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Verify Email</span>
              </div>
            ) : (
              <div className="mb-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setSuccessMsg('');
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:text-green-800"
                >
                  <ArrowLeft size={16} /> Back to Sign In
                </button>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Password Reset</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3.5 mb-5">
                <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {serverSlow && !error && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-5">
                <Loader2 size={16} className="text-amber-600 flex-shrink-0 mt-0.5 animate-spin" />
                <p className="text-sm text-amber-800">
                  <strong>Still connecting…</strong> The server is taking longer than usual to respond. Please wait a moment.
                </p>
              </div>
            )}

            {successMsg && (
              <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-xl p-3.5 mb-5">
                <CheckCircle2 size={16} className="text-green-700 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-800 font-medium">{successMsg}</p>
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Employee ID</label>
                  <input
                    name="employeeId"
                    value={loginForm.employeeId}
                    onChange={handleLoginChange}
                    placeholder="e.g. 12243"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-green-600 focus:ring-green-600 rounded-xl text-slate-900 outline-none transition-all focus:ring-2 focus:ring-opacity-20"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-semibold text-slate-700">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError('');
                        setSuccessMsg('');
                      }}
                      className="text-xs font-semibold text-green-700 hover:text-green-800"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      name="password"
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginForm.password}
                      onChange={handleLoginChange}
                      placeholder="Enter password"
                      className="w-full px-4 py-3 pr-11 bg-slate-50 border border-slate-200 focus:border-green-600 focus:ring-green-600 rounded-xl text-slate-900 outline-none transition-all focus:ring-2 focus:ring-opacity-20"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((s) => !s)}
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                    >
                      {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-3.5 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? <Spinner size={18} className="text-white" /> : null}
                  {loading ? 'Signing In…' : 'Sign In'}
                </button>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    name="fullName"
                    value={regForm.fullName}
                    onChange={handleRegChange}
                    placeholder="As in hospital records"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-600 rounded-xl text-slate-900 outline-none transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Employee ID</label>
                  <input
                    name="employeeId"
                    value={regForm.employeeId}
                    onChange={handleRegChange}
                    placeholder="e.g. 12243"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-600 rounded-xl text-slate-900 outline-none transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Official Email Address</label>
                  <input
                    name="email"
                    type="email"
                    value={regForm.email}
                    onChange={handleRegChange}
                    placeholder="name@jphrc.org"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-600 rounded-xl text-slate-900 outline-none transition-all text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">Must match your official email registered in OfficePortal HRMS.</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Set Password</label>
                  <div className="relative">
                    <input
                      name="password"
                      type={showRegPassword ? 'text' : 'password'}
                      value={regForm.password}
                      onChange={handleRegChange}
                      placeholder="Min 6 chars (letter + number/symbol)"
                      className="w-full px-4 py-2.5 pr-11 bg-slate-50 border border-slate-200 focus:border-green-600 rounded-xl text-slate-900 outline-none transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((s) => !s)}
                      aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                    >
                      {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? <Spinner size={16} className="text-white" /> : null}
                  {loading ? 'Sending OTP…' : 'Create Account'}
                </button>
              </form>
            )}

            {mode === 'register_otp' && (
              <form onSubmit={handleVerifyRegOtpSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Enter OTP</label>
                  <input
                    name="otp"
                    value={regForm.otp}
                    onChange={handleRegChange}
                    placeholder="Enter the 6-digit OTP sent to your email"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-600 rounded-xl text-slate-900 outline-none transition-all text-sm tracking-widest text-center font-mono"
                    maxLength={6}
                  />
                  <p className="text-xs text-slate-500 mt-2 text-center">
                    Sent to <span className="font-medium text-slate-700">{regForm.email}</span>
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? <Spinner size={16} className="text-white" /> : null}
                  {loading ? 'Verifying & Creating…' : 'Verify & Create Account'}
                </button>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <p className="text-sm text-slate-600 mb-2">
                  Enter your registered Employee ID and Email address. We will send a verification OTP to reset your password.
                </p>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Employee ID</label>
                  <input
                    name="employeeId"
                    value={forgotForm.employeeId}
                    onChange={handleForgotChange}
                    placeholder="e.g. 12243"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-600 rounded-xl text-slate-900 outline-none transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Registered Email Address</label>
                  <input
                    name="email"
                    type="email"
                    value={forgotForm.email}
                    onChange={handleForgotChange}
                    placeholder="name@jphrc.org"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-600 rounded-xl text-slate-900 outline-none transition-all text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={localLoading}
                  className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                >
                  {localLoading ? <Spinner size={16} className="text-white" /> : null}
                  {localLoading ? 'Sending OTP…' : 'Send Reset OTP'}
                </button>
              </form>
            )}

            {mode === 'forgot_otp' && (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <p className="text-sm text-slate-600 mb-2">
                  Enter the 6-digit OTP sent to your email along with your new password.
                </p>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Enter OTP</label>
                  <input
                    name="otp"
                    value={forgotForm.otp}
                    onChange={handleForgotChange}
                    placeholder="6-digit OTP"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-600 rounded-xl text-slate-900 outline-none transition-all text-sm font-mono tracking-widest text-center"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      name="newPassword"
                      type={showForgotPassword ? 'text' : 'password'}
                      value={forgotForm.newPassword}
                      onChange={handleForgotChange}
                      placeholder="Min 6 chars (letter + number/symbol)"
                      className="w-full px-4 py-2.5 pr-11 bg-slate-50 border border-slate-200 focus:border-green-600 rounded-xl text-slate-900 outline-none transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword((s) => !s)}
                      aria-label={showForgotPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                    >
                      {showForgotPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={localLoading}
                  className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
                >
                  {localLoading ? <Spinner size={16} className="text-white" /> : null}
                  {localLoading ? 'Resetting…' : 'Set New Password & Sign In'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
