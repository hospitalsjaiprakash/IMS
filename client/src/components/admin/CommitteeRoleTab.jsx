import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { Spinner, ConfirmDialog } from '../ui';
import {
  Search, Plus, Lock, ShieldCheck, Award, UserMinus, ArrowUpRight, ArrowDownRight, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '../../utils/helpers';

const TAB_CONFIG = {
  system_admin: {
    title: 'System Administrators',
    subtitle: 'Personnel holding full administrative control over system parameters, portal roles, and audit oversight',
    icon: Lock,
    iconBg: 'bg-rose-100 text-rose-600',
    btnClass: 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20',
    btnLabel: 'Assign Admin',
    cardClass: 'from-rose-50/60 to-white border-rose-200/80',
    avatarBg: 'bg-rose-600 shadow-rose-500/25',
    hoverText: 'group-hover:text-rose-600',
    searchPlaceholder: 'Search administrators...',
    emptyText: 'No System Administrators found matching your search.',
    defaultRole: 'system_admin',
    revokeImpact: 'System Administration',
  },
  imc: {
    title: 'Incident Management Committee (IMC)',
    subtitle: 'Quality Department & multi-disciplinary committee empowered to investigate incidents; the IMC Lead / Convenor can escalate priority',
    icon: ShieldCheck,
    iconBg: 'bg-indigo-100 text-indigo-600',
    btnClass: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20',
    btnLabel: 'Add IMC Member',
    cardClass: 'from-indigo-50/60 to-white border-indigo-200/80',
    avatarBg: 'bg-indigo-600 shadow-indigo-500/25',
    hoverText: 'group-hover:text-indigo-600',
    searchPlaceholder: 'Search IMC members...',
    emptyText: 'No IMC members found matching your search.',
    defaultRole: 'imc',
    revokeImpact: 'the IMC Committee',
  },
  management: {
    title: 'Executive Management & Leadership',
    subtitle: 'Executive leadership with final resolution approval and organization-wide oversight',
    icon: Award,
    iconBg: 'bg-purple-100 text-purple-600',
    btnClass: 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20',
    btnLabel: 'Add Executive',
    cardClass: 'from-purple-50/60 to-white border-purple-200/80',
    avatarBg: 'bg-purple-600 shadow-purple-500/25',
    hoverText: 'group-hover:text-purple-600',
    searchPlaceholder: 'Search executives...',
    emptyText: 'No executive personnel found matching your search.',
    defaultRole: 'head_management',
    revokeImpact: 'Executive Management',
  },
};

export default function CommitteeRoleTab({
  type, // 'system_admin' | 'imc' | 'management'
  members = [],
  isLoading = false,
  tabSearch = '',
  onTabSearchChange,
  onOpenAssign,
}) {
  const qc = useQueryClient();
  const cfg = TAB_CONFIG[type];
  const Icon = cfg.icon;

  const [revokeTarget, setRevokeTarget] = useState(null);
  const [convenorTarget, setConvenorTarget] = useState(null);

  const filteredMembers = useMemo(() => {
    const ts = tabSearch.trim().toLowerCase();
    if (!ts) return members;
    return members.filter(
      (m) =>
        (m.full_name || '').toLowerCase().includes(ts) ||
        (m.employee_id || '').toLowerCase().includes(ts) ||
        (m.department || '').toLowerCase().includes(ts)
    );
  }, [members, tabSearch]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['master-employees'] });
    qc.invalidateQueries({ queryKey: ['system-admins'] });
    qc.invalidateQueries({ queryKey: ['imc-members'] });
    qc.invalidateQueries({ queryKey: ['management-members'] });
    qc.invalidateQueries({ queryKey: ['role-audit'] });
  };

  const revokeMutation = useMutation({
    mutationFn: (target) => {
      if (type === 'system_admin') return adminApi.removeSystemAdmin(target.id || target.employee_id);
      if (type === 'management') return adminApi.removeManagement(target.id);
      if (target.id) return adminApi.removeImc(target.id);
      return adminApi.stopImcAccess({ employeeId: target.employee_id });
    },
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Access revoked successfully.');
      setRevokeTarget(null);
      invalidateAll();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to revoke access')),
  });

  const convenorMutation = useMutation({
    mutationFn: ({ employeeId, makeLead }) =>
      adminApi.assignRole({
        employeeId,
        targetRole: makeLead ? 'imc_convenor' : 'imc',
      }),
    onSuccess: (_, vars) => {
      toast.success(
        vars.makeLead
          ? 'Member promoted to IMC Lead / Convenor.'
          : 'IMC Lead / Convenor status stepped down to Member.'
      );
      setConvenorTarget(null);
      invalidateAll();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to update IMC Convenor status')),
  });

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md p-6 sm:p-8 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl ${cfg.iconBg} flex items-center justify-center`}>
              <Icon size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-900">{cfg.title}</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">{cfg.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={cfg.searchPlaceholder}
              value={tabSearch}
              onChange={(e) => onTabSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {tabSearch && (
              <button
                type="button"
                onClick={() => onTabSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenAssign(cfg.defaultRole)}
            className={`px-5 py-2 ${cfg.btnClass} text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all`}
          >
            <Plus size={16} /> {cfg.btnLabel}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Spinner size={32} />
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm font-medium bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          {cfg.emptyText}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredMembers.map((m) => {
            const isRootAdmin = type === 'system_admin' && String(m.employee_id).trim() === '00000';
            return (
              <div
                key={m.id || m.employee_id}
                className={`rounded-2xl p-5 bg-gradient-to-br ${cfg.cardClass} border shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4 group`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-2xl ${cfg.avatarBg} text-white flex items-center justify-center flex-shrink-0 font-black text-lg shadow-md`}>
                    {m.full_name?.charAt(0) || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-black text-slate-900 truncate ${cfg.hoverText} transition-colors`}>
                        {m.full_name}
                      </p>
                      {type === 'system_admin' && (
                        isRootAdmin ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-600 text-white uppercase tracking-wider shrink-0">
                            ROOT ADMIN
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200 uppercase tracking-wider shrink-0">
                            ADMIN
                          </span>
                        )
                      )}
                      {type === 'imc' && (
                        m.is_imc_lead ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-indigo-600 text-white uppercase tracking-wider shrink-0">
                            CONVENOR
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-100 text-indigo-700 uppercase shrink-0">
                            MEMBER
                          </span>
                        )
                      )}
                      {type === 'management' && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-600 text-white uppercase tracking-wider shrink-0">
                          EXECUTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono font-bold text-slate-600 mt-1">ID: {m.employee_id}</p>
                    <p className="text-xs text-slate-500 truncate mt-1">
                      {m.designation || 'Staff'} · {m.department || 'Hospital Staff'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 flex-wrap">
                  {type === 'imc' ? (
                    <button
                      type="button"
                      onClick={() => setConvenorTarget({ member: m, makeLead: !m.is_imc_lead })}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all inline-flex items-center gap-1 ${
                        m.is_imc_lead
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                          : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                      }`}
                    >
                      {m.is_imc_lead ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                      {m.is_imc_lead ? 'Step Down Lead' : 'Make Convenor'}
                    </button>
                  ) : (
                    <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {isRootAdmin ? 'Admin Portal Only' : 'Portal Access Active'}
                    </span>
                  )}

                  {isRootAdmin ? (
                    <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-500 border border-slate-200 text-[11px] font-bold inline-flex items-center gap-1">
                      <Lock size={11} /> Protected
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRevokeTarget(m)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 text-red-600 border border-slate-200 hover:border-red-200 text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-2xs"
                    >
                      <UserMinus size={13} /> Revoke
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onClose={() => !revokeMutation.isPending && setRevokeTarget(null)}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget)}
        title="Confirm Access Revocation"
        message={
          revokeTarget
            ? `Revoke ${cfg.revokeImpact} privileges for ${revokeTarget.full_name} (${revokeTarget.employee_id})? They will keep their standard employee access and assigned category mappings.`
            : ''
        }
        confirmLabel={revokeMutation.isPending ? 'Revoking...' : 'Confirm Revocation'}
        danger
      />

      <ConfirmDialog
        open={Boolean(convenorTarget)}
        onClose={() => !convenorMutation.isPending && setConvenorTarget(null)}
        onConfirm={() =>
          convenorTarget &&
          convenorMutation.mutate({
            employeeId: convenorTarget.member.employee_id,
            makeLead: convenorTarget.makeLead,
          })
        }
        title={convenorTarget?.makeLead ? 'Promote to IMC Lead / Convenor' : 'Remove IMC Lead / Convenor Role'}
        message={
          convenorTarget
            ? convenorTarget.makeLead
              ? `Promote ${convenorTarget.member.full_name} (${convenorTarget.member.employee_id}) to IMC Lead / Convenor? They will gain authority to escalate incident priority and coordinate IMC reviews.`
              : `Step down ${convenorTarget.member.full_name} (${convenorTarget.member.employee_id}) to standard IMC Member? Active sessions will refresh permissions.`
            : ''
        }
        confirmLabel={
          convenorMutation.isPending
            ? 'Updating...'
            : convenorTarget?.makeLead
            ? 'Promote to Convenor'
            : 'Confirm Step Down'
        }
        danger={!convenorTarget?.makeLead}
      />
    </div>
  );
}
