import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Modal, Spinner } from '../ui';
import { AlertCircle, Lock, Eye, EyeOff, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CommitteeLoginModal({ open, onClose, targetRole }) {
  const navigate = useNavigate();
  const { switchRole, loading, user } = useAuthStore();
  
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');

  const handleModalClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  const getTitle = () => {
    if (targetRole === 'imc') return 'Switch to IMC Dashboard';
    if (targetRole === 'head_management') return 'Switch to Management Dashboard';
    if (targetRole === 'system_admin') return 'Switch to System Admin Portal';
    if (targetRole === 'hod') return 'Switch to HOD Dashboard';
    if (targetRole === 'employee') return 'Switch to Employee Portal';
    return 'Verify Identity & Switch Role';
  };

  const getRoleBadgeColor = () => {
    if (targetRole === 'imc') return 'bg-indigo-50 border-indigo-200 text-indigo-700';
    if (targetRole === 'head_management') return 'bg-purple-50 border-purple-200 text-purple-700';
    if (targetRole === 'system_admin') return 'bg-red-50 border-red-200 text-red-700';
    return 'bg-green-50 border-green-200 text-green-700';
  };

  const handleSwitchSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter your login password to switch roles.');
      return;
    }

    const result = await switchRole({ password, targetRole });
    if (result.success) {
      toast.success(`Successfully switched role to ${targetRole.replace(/_/g, ' ').toUpperCase()}`);
      handleModalClose();
      if (targetRole === 'imc') navigate('/imc/dashboard');
      else if (targetRole === 'head_management') navigate('/management/dashboard');
      else if (targetRole === 'system_admin') navigate('/admin/dashboard');
      else navigate('/dashboard');
    } else {
      setError(result.error || 'Incorrect login password.');
    }
  };

  return (
    <Modal open={open} onClose={handleModalClose} title={getTitle()} size="sm">
      <form onSubmit={handleSwitchSubmit} className="space-y-4 pt-2">
        <div className="flex items-center justify-center mb-2">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
            <Lock className="text-slate-600" size={20} />
          </div>
        </div>

        {/* User identification card */}
        {user && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-green-600 text-white font-bold text-xs flex items-center justify-center">
                {user.fullName?.charAt(0) || 'U'}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">{user.fullName}</p>
                <p className="text-[10px] text-slate-500 font-mono">ID: {user.employeeId}</p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${getRoleBadgeColor()}`}>
              {targetRole?.replace(/_/g, ' ')}
            </span>
          </div>
        )}

        <p className="text-xs text-slate-600 text-center px-2">
          Please re-enter your personal login password to verify your identity and switch active roles.
        </p>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div>
          <label className="field-label field-required">Account Login Password</label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter your login password…"
              className="input pr-10"
              autoFocus
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

        <div className="pt-3">
          <button
            type="submit"
            disabled={loading}
            className="btn w-full h-11 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold shadow-sm flex items-center justify-center gap-2"
          >
            {loading ? <Spinner size={16} className="text-white" /> : <UserCheck size={16} />}
            {loading ? 'Verifying & Switching...' : 'Verify Password & Switch'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
