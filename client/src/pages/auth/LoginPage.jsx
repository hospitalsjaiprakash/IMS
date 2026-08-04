import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../api';
import { AlertCircle, CheckCircle2, UserPlus, LogIn, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Spinner } from '../../components/ui';

import jphBuildImg from '../../assets/JPHBUILD.webp';
import logoImg from '../../assets/logo.webp';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register, loading } = useAuthStore();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot' | 'forgot_otp'
  const [localLoading, setLocalLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Login state
  const [loginForm, setLoginForm] = useState({ employeeId: '', password: '' });
  
  // Register state
  const [regForm, setRegForm] = useState({ fullName: '', employeeId: '', whatsapp: '', email: '', password: '' });
  
  // Forgot password state
  const [forgotForm, setForgotForm] = useState({ employeeId: '', email: '', otp: '', newPassword: '' });

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLoginChange = (e) => {
    setLoginForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
    setSuccessMsg('');
  };

  const handleRegChange = (e) => {
    setRegForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
    setSuccessMsg('');
  };

  const handleForgotChange = (e) => {
    setForgotForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
    setSuccessMsg('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginForm.employeeId.trim() || !loginForm.password) {
      setError('Employee ID and password are required.');
      return;
    }
    const result = await login(loginForm);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!regForm.fullName.trim() || !regForm.employeeId.trim() || !regForm.email.trim() || !regForm.password) {
      setError('Full Name, Employee ID, Email, and Password are required.');
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
        email: forgotForm.email
      });
      setSuccessMsg(res.data.message || 'OTP sent to your email address.');
      setMode('forgot_otp');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP. Please check your credentials.');
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
    if (forgotForm.newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLocalLoading(true);
    setError('');
    try {
      const res = await authApi.employeeResetPassword({
        employeeId: forgotForm.employeeId,
        otp: forgotForm.otp,
        newPassword: forgotForm.newPassword
      });
      setSuccessMsg(res.data.message || 'Password reset successfully! Please log in.');
      setMode('login');
      setLoginForm({ employeeId: forgotForm.employeeId, password: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password. Please check OTP.');
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left Split: Hero Image */}
      <div className="hidden lg:flex lg:w-[65%] relative bg-green-900 overflow-hidden">
        <img
          src={jphBuildImg}
          alt="Jaiprakash Hospital Building"
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-green-900/80 to-transparent" />
        <div className="relative z-10 flex flex-col justify-end p-16 w-full text-white">
          <h2 className="text-5xl lg:text-7xl font-bold font-display mb-6 tracking-tight text-white drop-shadow-lg">
            WELCOME TO THE IMS
          </h2>
          <h2 className="text-3xl font-bold font-display mb-2 text-white/90">
            Jaiprakash Hospital & Research Centre
          </h2>
          <p className="text-green-50 text-lg italic">
            Quality Healthcare at Affordable Price
          </p>
        </div>
      </div>

      {/* Right Split: Login Form */}
      <div className="w-full lg:w-[35%] flex flex-col relative bg-white overflow-y-auto">
        {/* Form Area */}
        <div className="flex-1 flex items-center justify-center p-6 pt-12 pb-12">
          <div className="w-full max-w-[420px]">
            {/* Header */}
            <div className="text-center mb-8">
              <img src={logoImg} alt="JPHRC Logo" className="h-16 mx-auto mb-4 drop-shadow-sm" />
              <h1 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
                EMPLOYEE PORTAL
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Incident Management System
              </p>
            </div>

            {/* Mode Switcher */}
            {mode === 'login' || mode === 'register' ? (
              <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${mode === 'login' ? 'bg-white text-green-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  <LogIn size={16} className={mode === 'login' ? 'text-green-600' : 'text-slate-400'} />
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${mode === 'register' ? 'bg-white text-green-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  <UserPlus size={16} className={mode === 'register' ? 'text-green-600' : 'text-slate-400'} />
                  Create Account
                </button>
              </div>
            ) : (
              <div className="mb-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
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

            {successMsg && (
              <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-xl p-3.5 mb-5">
                <CheckCircle2 size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-800 font-medium">{successMsg}</p>
              </div>
            )}

            {mode === 'login' && (
              /* LOGIN FORM */
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Employee ID</label>
                  <input
                    name="employeeId"
                    value={loginForm.employeeId}
                    onChange={handleLoginChange}
                    placeholder="e.g. 13574"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-green-500 focus:ring-green-500 rounded-xl text-slate-900 outline-none transition-all focus:ring-2 focus:ring-opacity-20"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-semibold text-slate-700">Password</label>
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); setSuccessMsg(''); }}
                      className="text-xs font-semibold text-green-600 hover:text-green-700"
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
                      className="w-full px-4 py-3 pr-11 bg-slate-50 border border-slate-200 focus:border-green-500 focus:ring-green-500 rounded-xl text-slate-900 outline-none transition-all focus:ring-2 focus:ring-opacity-20"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                      title={showLoginPassword ? 'Hide password' : 'Show password'}
                    >
                      {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
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
                    placeholder="As in hospital records (e.g. NIRMAL NAIK)"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Employee ID</label>
                  <input
                    name="employeeId"
                    value={regForm.employeeId}
                    onChange={handleRegChange}
                    placeholder="e.g. 13574"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">WhatsApp Number</label>
                  <input
                    name="whatsapp"
                    value={regForm.whatsapp}
                    onChange={handleRegChange}
                    placeholder="e.g. 8093421865"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    name="email"
                    type="email"
                    value={regForm.email}
                    onChange={handleRegChange}
                    placeholder="e.g. nirmalnaik1402@gmail.com"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Set Password</label>
                  <div className="relative">
                    <input
                      name="password"
                      type={showRegPassword ? 'text' : 'password'}
                      value={regForm.password}
                      onChange={handleRegChange}
                      placeholder="Create a secure password"
                      className="w-full px-4 py-2.5 pr-11 bg-slate-50 border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                      title={showRegPassword ? 'Hide password' : 'Show password'}
                    >
                      {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
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
                    placeholder="e.g. 13574"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none transition-all text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Registered Email Address</label>
                  <input
                    name="email"
                    type="email"
                    value={forgotForm.email}
                    onChange={handleForgotChange}
                    placeholder="e.g. nirmalnaik1402@gmail.com"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none transition-all text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={localLoading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
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
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none transition-all text-sm font-mono tracking-widest text-center"
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
                      placeholder="Create new secure password"
                      className="w-full px-4 py-2.5 pr-11 bg-slate-50 border border-slate-200 focus:border-green-500 rounded-xl text-slate-900 outline-none transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(!showForgotPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                      title={showForgotPassword ? 'Hide password' : 'Show password'}
                    >
                      {showForgotPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={localLoading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed text-sm"
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
