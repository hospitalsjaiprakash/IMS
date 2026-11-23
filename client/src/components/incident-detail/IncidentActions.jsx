import { useState } from 'react';
import { Pencil, XCircle, MessageSquare, AlertTriangle, CheckCircle, Undo2, Flame, Layers } from 'lucide-react';
import { Spinner, ConfirmDialog } from '../../components/ui';

export default function IncidentActions({
  incident,
  user,
  canWithdraw,
  canHodFeedback,
  canRequestRedirect,
  canMdAct,
  canReopen,
  canEscalate,
  canInvolveDepartments,
  setShowWithdrawModal,
  setShowFeedbackModal,
  setShowRedirectModal,
  setShowMdModal,
  setShowReopenModal,
  setShowImcReportModal,
  setShowInvolveDeptModal,
  openEditIncident,
  escalateMutation,
  closeIncidentMutation,
  canGenerateImcReport,
  canCloseIncident,
}) {
  const [confirmEscalateOpen, setConfirmEscalateOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const isEmployeeReporter = user?.id === incident.reporter_id && incident.status === 'submitted';
  const showEscalateButton = Boolean(canEscalate && user?.role === 'imc' && (user?.is_imc_lead || user?.isImcLead));

  if (
    !canWithdraw &&
    !canHodFeedback &&
    !canRequestRedirect &&
    !canMdAct &&
    !canReopen &&
    !showEscalateButton &&
    !isEmployeeReporter &&
    !canGenerateImcReport &&
    !canCloseIncident &&
    !canInvolveDepartments
  ) {
    return null;
  }

  return (
    <>
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
        {canInvolveDepartments && (
          <button
            onClick={() => setShowInvolveDeptModal(true)}
            className="btn-secondary btn-sm border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-1.5 shadow-xs"
          >
            <Layers size={14} /> + Involve Category
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
            <CheckCircle size={14} /> Management Action
          </button>
        )}
        {canGenerateImcReport && (
          <button onClick={() => setShowImcReportModal(true)} className="btn-primary btn-sm">
            <Pencil size={14} /> Generate IMC Report
          </button>
        )}
        {canCloseIncident && (
          <button
            onClick={() => setConfirmCloseOpen(true)}
            disabled={closeIncidentMutation.isPending}
            className="btn-primary btn-sm"
          >
            {closeIncidentMutation.isPending ? <Spinner size={14} /> : <CheckCircle size={14} />}
            Verify Training &amp; Close Incident
          </button>
        )}
        {canReopen && (
          <button onClick={() => setShowReopenModal(true)} className="btn-ghost btn-sm text-slate-600">
            <Undo2 size={14} /> Re-open
          </button>
        )}
        {showEscalateButton && (
          <button
            onClick={() => setConfirmEscalateOpen(true)}
            disabled={escalateMutation.isPending}
            className="btn-secondary btn-sm border-red-200 text-red-600 hover:bg-red-50"
          >
            {escalateMutation.isPending ? <Spinner size={14} /> : <Flame size={14} />}
            Escalate Priority
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmEscalateOpen}
        onClose={() => setConfirmEscalateOpen(false)}
        onConfirm={() => {
          setConfirmEscalateOpen(false);
          escalateMutation.mutate();
        }}
        title="Escalate Incident Priority"
        message={`Mark incident ${incident?.reference_id} as high-priority escalated? Immediate notifications will be sent to IMC and Executive Management.`}
        confirmLabel="Escalate Now"
        danger={true}
      />

      <ConfirmDialog
        open={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        onConfirm={() => {
          setConfirmCloseOpen(false);
          closeIncidentMutation.mutate();
        }}
        title="Close Incident"
        message={`Confirm that mandatory training is complete and mark incident ${incident?.reference_id} as closed?`}
        confirmLabel="Confirm & Close"
      />
    </>
  );
}
