import React from 'react';
import { Pencil, XCircle, MessageSquare, AlertTriangle, CheckCircle, Undo2, Flame, Bell } from 'lucide-react';
import { Spinner } from '../../components/ui';

export default function IncidentActions({
  incident,
  user,
  feedbacks,
  canWithdraw,
  canHodFeedback,
  canRequestRedirect,
  canMdAct,
  canReopen,
  canEscalate,
  canRemindHod,
  setShowWithdrawModal,
  setShowFeedbackModal,
  setShowRedirectModal,
  setShowMdModal,
  setShowReopenModal,
  openEditIncident,
  escalateMutation,
  remindHodMutation
}) {
  const isEmployeeReporter = user?.id === incident.reporter_id && incident.status === 'submitted';

  if (!canWithdraw && !canHodFeedback && !canRequestRedirect && !canMdAct && !canReopen && !canEscalate && !canRemindHod && !isEmployeeReporter) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {isEmployeeReporter && (
        <button onClick={() => openEditIncident(incident)} className="btn-secondary btn-sm">
          <Pencil size={14} /> Edit Incident
        </button>
      )}
      {canWithdraw && (
        <button onClick={() => setShowWithdrawModal(true)} className="btn-secondary btn-sm border-red-200 text-red-600 hover:bg-red-50">
          <XCircle size={14} /> Withdraw
        </button>
      )}
      {canHodFeedback && (
        <button onClick={() => setShowFeedbackModal(true)} className="btn-primary btn-sm">
          <MessageSquare size={14} /> Submit Feedback
        </button>
      )}
      {canRequestRedirect && (
        <button onClick={() => setShowRedirectModal(true)} className="btn-secondary btn-sm border-orange-200 text-orange-700 hover:bg-orange-50">
          <AlertTriangle size={14} /> Request Redirection to IMC
        </button>
      )}
      {canMdAct && (
        <button onClick={() => setShowMdModal(true)} className="btn-primary btn-sm">
          <CheckCircle size={14} /> Close & Generate Report
        </button>
      )}
      {canReopen && (
        <button onClick={() => setShowReopenModal(true)} className="btn-ghost btn-sm text-slate-600">
          <Undo2 size={14} /> Re-open
        </button>
      )}
      {canEscalate && (
        <button onClick={() => escalateMutation.mutate()} disabled={escalateMutation.isPending} className="btn-secondary btn-sm border-red-200 text-red-600 hover:bg-red-50">
          {escalateMutation.isPending ? <Spinner size={14} /> : <Flame size={14} />}
          Escalate Priority
        </button>
      )}
      {canRemindHod && (
        <button
          onClick={() => remindHodMutation.mutate()}
          disabled={remindHodMutation.isPending}
          className="btn-secondary btn-sm border-amber-300 text-amber-800 hover:bg-amber-50 font-medium flex items-center gap-1.5 shadow-sm"
          title="Send system notification and email to HOD requesting feedback"
        >
          {remindHodMutation.isPending ? <Spinner size={14} /> : <Bell size={14} className="text-amber-600 animate-pulse" />}
          Remind HOD (Mail & Notification)
        </button>
      )}
    </div>
  );
}
