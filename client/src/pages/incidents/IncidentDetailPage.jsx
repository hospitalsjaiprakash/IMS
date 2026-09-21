import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { incidentsApi, metaApi, UPLOADS_URL } from '../../api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { ArrowLeft, Clock, Calendar, CheckCircle, AlertTriangle, MessageSquare, UserCheck, Bell, Pencil, Paperclip } from 'lucide-react';
import { Alert, Spinner, Breadcrumbs, SkeletonDetail } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';

import IncidentHeader from '../../components/incident-detail/IncidentHeader';
import IncidentDetailsCard from '../../components/incident-detail/IncidentDetailsCard';
import InteractiveTimeline from '../../components/incident-detail/InteractiveTimeline';
import IncidentActions from '../../components/incident-detail/IncidentActions';
import FileUploadArea from '../../components/incident-detail/FileUploadArea';

import {
  WithdrawModal,
  HodFeedbackModal,
  ManagementDecisionModal,
  ReopenModal,
  RedirectIncidentModal,
  RejectRedirectModal,
  EditFeedbackModal,
  EditIncidentModal,
  FilePreviewModal,
  AssignInvestigatorModal,
  ImcReportModal
} from '../../components/incident-detail/modals';

const TIMELINE_STAGES = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'with_hod', label: 'Awaiting HOD Feedback' },
  { key: 'with_imc', label: 'HOD Reviewed - Awaiting IMC' },
  { key: 'with_head_management', label: 'IMC Reviewed - Awaiting Mgmt' },
  { key: 'pending_imc_report', label: 'Mgmt Decided - Awaiting IMC Report' },
  { key: 'pending_training', label: 'Awaiting CAPA / Training' },
  { key: 'closed', label: 'Closed' },
];

const statusOrder = {
  submitted: 0, with_hod: 1, with_hod_and_imc: 1, with_imc: 2,
  redirect_requested: 2, with_head_management: 3, pending_imc_report: 4, pending_training: 5, resolved: 6, closed: 6,
};

function StatusMessage({ status }) {
  const msgs = {
    submitted: { type: 'info', msg: 'Your incident has been submitted successfully and is awaiting HOD feedback.' },
    with_hod: { type: 'info', msg: 'Your incident has been routed to the Head of Department and is currently awaiting their review and feedback.' },
    with_hod_and_imc: { type: 'info', msg: 'Due to grave severity, your incident is currently awaiting simultaneous review and feedback from both the HOD and IMC.' },
    with_imc: { type: 'info', msg: 'Your incident is currently awaiting review and feedback from the Incident Management Committee.' },
    with_head_management: { type: 'info', msg: 'Your incident is currently awaiting review and feedback from Hospital Management.' },
    pending_imc_report: { type: 'info', msg: 'Management has submitted their decision. Awaiting IMC Convenor to generate the official report.' },
    pending_training: { type: 'warning', msg: 'Mandatory CAPA / Training is required before this incident can be fully closed.' },
    resolved: { type: 'success', msg: 'Your incident has been resolved. View the final report below.' },
    closed: { type: 'success', msg: 'Your incident has been officially closed.' },
    withdrawn: { type: 'warning', msg: 'This incident has been withdrawn by you.' },
    redirect_requested: { type: 'warning', msg: 'A redirection request has been submitted to the IMC for routing to the correct department.' },
  };
  const { type, msg } = msgs[status] || { type: 'info', msg: 'Status updated.' };
  return <Alert type={type} message={msg} />;
}

export default function IncidentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showMdModal, setShowMdModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showRedirectModal, setShowRedirectModal] = useState(false);
  const [showRejectRedirectModal, setShowRejectRedirectModal] = useState(false);
  const [showAssignInvestigatorModal, setShowAssignInvestigatorModal] = useState(false);
  const [showImcReportModal, setShowImcReportModal] = useState(false);

  const [editFbModal, setEditFbModal] = useState(null); // { feedbackType, currentText }
  const [editFbText, setEditFbText] = useState('');

  const [showEditIncModal, setShowEditIncModal] = useState(false);
  const [editInc, setEditInc] = useState({});
  const [zoomedFeedback, setZoomedFeedback] = useState(null);

  const [withdrawReason, setWithdrawReason] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [imcSeverity, setImcSeverity] = useState('');
  const [imcProposedOutcome, setImcProposedOutcome] = useState('');
  const [mdFaultType, setMdFaultType] = useState('');
  const [mdActions, setMdActions] = useState('');
  const [mdRequireTraining, setMdRequireTraining] = useState(false);
  const [mdResponsibleEmployees, setMdResponsibleEmployees] = useState([]);
  const [mdProposedOutcome, setMdProposedOutcome] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [hodAcknowledged, setHodAcknowledged] = useState(false);
  const [redirectReason, setRedirectReason] = useState('');
  const [redirectTargetDept, setRedirectTargetDept] = useState('');
  const [rejectRedirectReason, setRejectRedirectReason] = useState('');

  const [hodAttachments, setHodAttachments] = useState([]);
  const [imcAttachments, setImcAttachments] = useState([]);
  const [mdAttachments, setMdAttachments] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);

  // Investigator States
  const [investigatorRequired, setInvestigatorRequired] = useState(false);
  const [selectedInvestigator, setSelectedInvestigator] = useState('');
  const [investigatorReportText, setInvestigatorReportText] = useState('');
  const [investigatorAttachments, setInvestigatorAttachments] = useState([]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setShowWithdrawModal(false);
        setShowFeedbackModal(false);
        setShowMdModal(false);
        setShowReopenModal(false);
        setShowRedirectModal(false);
        setShowRejectRedirectModal(false);
        setShowAssignInvestigatorModal(false);
        setShowImcReportModal(false);
        setShowEditIncModal(false);
        setEditFbModal(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => incidentsApi.get(id).then(r => r.data),
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ['incident', id] });

  const withdrawMutation = useMutation({
    mutationFn: () => incidentsApi.withdraw(id, { reason: withdrawReason }),
    onSuccess: () => { toast.success('Incident withdrawn.'); setShowWithdrawModal(false); refetch(); }
  });

  const hodFeedbackMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('feedbackText', feedbackText);
      fd.append('acknowledged', hodAcknowledged);
      hodAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.hodFeedback(id, fd);
    },
    onSuccess: () => { toast.success('Feedback submitted.'); setShowFeedbackModal(false); setHodAttachments([]); setFeedbackText(''); refetch(); }
  });

  const imcFeedbackMutation = useMutation({
    mutationFn: (forwardToMd) => {
      const fd = new FormData();
      fd.append('feedbackText', feedbackText);
      fd.append('forwardToMd', !!forwardToMd);
      fd.append('severity', imcSeverity);
      if (imcProposedOutcome) fd.append('proposedOutcome', imcProposedOutcome);
      imcAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.imcFeedback(id, fd);
    },
    onSuccess: () => { toast.success('Feedback submitted.'); setShowFeedbackModal(false); setImcAttachments([]); setFeedbackText(''); setImcSeverity(''); setImcProposedOutcome(''); refetch(); }
  });

  const mdMutation = useMutation({
    mutationFn: (decisionType) => {
      const fd = new FormData();
      fd.append('decision', decisionType);
      fd.append('notes', mdActions); // Actually using mdActions as notes here or feedbackText? Let's use mdActions as notes for simplicity, but wait, maybe create a dedicated state for notes. For now I will leave it to be done in modal.
      fd.append('faultType', mdFaultType);
      fd.append('correctiveActions', mdActions);
      fd.append('requireTraining', mdRequireTraining);
      fd.append('responsibleEmployees', JSON.stringify(mdResponsibleEmployees));
      if (mdProposedOutcome) fd.append('proposedOutcome', mdProposedOutcome);
      mdAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.managementAction(id, fd);
    },
    onSuccess: () => { toast.success('Management action submitted.'); setShowMdModal(false); setMdAttachments([]); setMdFaultType(''); setMdActions(''); setMdResponsibleEmployees([]); setMdProposedOutcome(''); refetch(); }
  });

  const imcReportMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      imcAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.imcReport(id, fd);
    },
    onSuccess: () => { toast.success('Official IMC Report generated.'); setShowImcReportModal(false); setImcAttachments([]); refetch(); }
  });

  const closeIncidentMutation = useMutation({
    mutationFn: () => incidentsApi.closeIncident(id),
    onSuccess: () => { toast.success('Incident closed.'); refetch(); }
  });

  const reopenMutation = useMutation({
    mutationFn: () => incidentsApi.reopen(id, { reason: reopenReason }),
    onSuccess: () => { toast.success('Incident reopened.'); setShowReopenModal(false); refetch(); }
  });

  const escalateMutation = useMutation({
    mutationFn: () => incidentsApi.escalatePriority(id),
    onSuccess: () => { toast.success('Priority escalated!'); refetch(); }
  });

  const remindHodMutation = useMutation({
    mutationFn: () => incidentsApi.remindHod(id),
    onSuccess: (res) => { toast.success(res.data?.message || 'Reminder sent!'); refetch(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to send reminder')
  });

  const assignInvestigatorMutation = useMutation({
    mutationFn: (investigatorIds) => incidentsApi.assignInvestigator(id, { investigatorIds }),
    onSuccess: () => { toast.success('Investigators assigned successfully.'); setShowAssignInvestigatorModal(false); refetch(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to assign investigators')
  });

  const investigatorReportMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('reportText', investigatorReportText);
      investigatorAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.investigatorReport(id, fd);
    },
    onSuccess: () => { toast.success('Investigation Report submitted.'); setInvestigatorReportText(''); setInvestigatorAttachments([]); refetch(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to submit report')
  });

  const rejectInvestigatorReportMutation = useMutation({
    mutationFn: (data) => incidentsApi.rejectInvestigatorReport(id, data),
    onSuccess: () => { toast.success('Action submitted.'); refetch(); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to submit action')
  });

  const { data: imcMembers = [] } = useQuery({
    queryKey: ['imcMembers'],
    queryFn: () => usersApi.getImcMembers().then(res => res.data),
    enabled: user?.role === 'imc' && !!user?.isImcLead
  });

  const editFeedbackMutation = useMutation({
    mutationFn: ({ feedbackType, feedbackText: ft }) => incidentsApi.editFeedback(id, { feedbackType, feedbackText: ft }),
    onSuccess: () => { toast.success('Feedback updated.'); setEditFbModal(null); setEditFbText(''); refetch(); },
  });

  const editIncidentMutation = useMutation({
    mutationFn: (data) => incidentsApi.updateIncident(id, data),
    onSuccess: () => { toast.success('Incident updated.'); setShowEditIncModal(false); refetch(); },
  });

  const requestRedirectMutation = useMutation({
    mutationFn: () => incidentsApi.requestRedirect(id, { reason: redirectReason }),
    onSuccess: () => { toast.success('Redirection request submitted.'); setShowRedirectModal(false); refetch(); }
  });

  const approveRedirectMutation = useMutation({
    mutationFn: () => incidentsApi.approveRedirect(id, { targetDepartment: redirectTargetDept }),
    onSuccess: () => { toast.success('Incident successfully redirected.'); setRedirectTargetDept(''); refetch(); }
  });

  const rejectRedirectMutation = useMutation({
    mutationFn: () => incidentsApi.rejectRedirect(id, { reason: rejectRedirectReason }),
    onSuccess: () => { toast.success('Redirection request rejected.'); setShowRejectRedirectModal(false); refetch(); }
  });

  const verifyTrainingMutation = useMutation({
    mutationFn: () => incidentsApi.verifyTraining(id),
    onSuccess: () => { toast.success('Training completion verified.'); refetch(); }
  });

  const verifyEmployeeTrainingMutation = useMutation({
    mutationFn: (employeeId) => incidentsApi.verifyEmployeeTraining(id, employeeId),
    onSuccess: () => { toast.success('Employee training marked as completed.'); refetch(); }
  });

  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => metaApi.departments().then(r => r.data || []),
  });
  const departmentsList = deptsData || [];

  const openEditFeedback = (feedbackType, currentText) => {
    setEditFbModal({ feedbackType });
    setEditFbText(currentText || '');
  };

  const openEditIncident = (inc) => {
    setEditInc({
      description: inc.description || '',
      severity: inc.severity || '',
      occurredTo: inc.occurred_to || '',
      incidentDate: inc.incident_date || '',
      incidentTime: inc.incident_time?.slice(0, 5) || '',
    });
    setShowEditIncModal(true);
  };

  if (isLoading) return <SkeletonDetail />;
  if (error || !data) return <Alert type="error" title="Not found" message="Incident not found or access denied." />;

  const { incident, feedbacks, attachments, finalReport } = data;

  const canWithdraw = user?.id === incident.reporter_id && ['submitted', 'with_hod'].includes(incident.status);
  const canHodFeedback = user?.role === 'hod' && incident.is_target_hod && user?.id !== incident.reporter_id && ['with_hod', 'with_hod_and_imc'].includes(incident.status) && !feedbacks?.some(f => f.role === 'hod');
  const canRequestRedirect = user?.role === 'hod' && incident.is_target_hod && user?.id !== incident.reporter_id && ['with_hod', 'with_hod_and_imc'].includes(incident.status) && !feedbacks?.some(f => f.role === 'hod');
  const canImcAct = user?.role === 'imc' && user?.id !== incident.reporter_id && (['with_imc', 'with_hod_and_imc', 'redirect_requested', 'pending_training', 'with_imc_review'].includes(incident.status) || (incident.status === 'resolved' && incident.has_responsible_person && !incident.training_completed));
  const canMdAct = user?.role === 'head_management' && user?.id !== incident.reporter_id && incident.status === 'with_head_management';
  const canReopen = (user?.role === 'head_management' || user?.role === 'imc') && user?.id !== incident.reporter_id && ['resolved', 'closed'].includes(incident.status);
  const canEscalate = (user?.role === 'head_management' || user?.role === 'imc') && user?.id !== incident.reporter_id && !['resolved', 'closed', 'withdrawn'].includes(incident.status) && !incident.priority_escalated_by;
  const canRemindHod = (user?.role === 'head_management' || user?.role === 'imc') && user?.id !== incident.reporter_id && !['resolved', 'closed', 'withdrawn'].includes(incident.status) && !feedbacks?.some(fb => fb.role === 'hod');
  const canAssignInvestigator = ['imc', 'system_admin'].includes(user?.role) && user?.isImcLead && ['with_imc', 'with_hod_and_imc'].includes(incident.status);
  const canInvestigatorAct = incident.status === 'with_investigator' && incident.investigators?.some(i => i.investigator_id === user?.id && i.status !== 'completed');
  const canImcReviewInvestigator = user?.isImcLead && incident.status === 'with_imc_review';
  const canGenerateImcReport = ['imc', 'system_admin'].includes(user?.role) && user?.isImcLead && incident.status === 'pending_imc_report';
  const canCloseIncident = user?.role === 'imc' && incident.status === 'pending_training';

  const isHodOfDept = (deptName) => {
    if (!user || user.role !== 'hod') return false;
    return departmentsList.some(d => d.name === deptName && (d.hod_user_id === user.id || d.incharge_user_id === user.id || d.asst_coo_user_id === user.id));
  };
  
  const hodEmployees = incident.responsible_employees?.filter(emp => isHodOfDept(emp.department_name)) || [];

  return (
    <>
      <div className="mb-4 print:hidden flex flex-col gap-2">
        <Breadcrumbs items={[
          { label: 'Incidents', to: '/incidents' },
          { label: incident?.reference_id || 'Detail' }
        ]} />
        <div>
          <button onClick={() => navigate('/incidents')} className="btn-ghost text-slate-500 -ml-1 print:hidden">
            <ArrowLeft size={16} />
            Back to Incidents
          </button>
        </div>
      </div>

      <IncidentHeader 
        incident={incident} 
        user={user}
        actions={
          <IncidentActions
            incident={incident}
            user={user}
            feedbacks={feedbacks}
            canWithdraw={canWithdraw}
            canHodFeedback={canHodFeedback}
            canRequestRedirect={canRequestRedirect}
            canMdAct={canMdAct}
            canReopen={canReopen}
            canEscalate={canEscalate}
            canRemindHod={canRemindHod}
            canAssignInvestigator={canAssignInvestigator}
            canGenerateImcReport={canGenerateImcReport}
            canCloseIncident={canCloseIncident}
            setShowWithdrawModal={setShowWithdrawModal}
            setShowFeedbackModal={setShowFeedbackModal}
            setShowRedirectModal={setShowRedirectModal}
            setShowMdModal={setShowMdModal}
            setShowReopenModal={setShowReopenModal}
            setShowAssignInvestigatorModal={setShowAssignInvestigatorModal}
            setShowImcReportModal={setShowImcReportModal}
            openEditIncident={openEditIncident}
            escalateMutation={escalateMutation}
            remindHodMutation={remindHodMutation}
            closeIncidentMutation={closeIncidentMutation}
          />
        }
      />

      {/* --- NORMAL UI --- */}
      <div className="w-full space-y-5 print:hidden">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 print:block print:space-y-5">
          <div className="lg:col-span-2 space-y-5 print:block">
            <IncidentDetailsCard 
              incident={incident} 
              finalReport={finalReport} 
              feedbacks={feedbacks} 
              attachments={attachments}
              onViewAttachment={(att) => setPreviewFile(att)}
            />

            {feedbacks?.length > 0 && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-slate-800 mb-4">Review History</h2>
                <div className="space-y-4">
                  {feedbacks.map(fb => {
                    const canEditThisFb =
                      (fb.role === 'hod' && user?.role === 'hod') ||
                      (fb.role === 'imc' && user?.role === 'imc') ||
                      (fb.role === 'head_management' && user?.role === 'head_management');
                    return (
                      <div 
                        key={fb.id} 
                        onClick={() => setZoomedFeedback(fb)}
                        className="bg-slate-50 rounded-xl p-4 border border-slate-200 cursor-pointer hover:bg-slate-100 hover:shadow-md hover:border-slate-300 transition-all duration-200"
                        title="Click to zoom and read on projector"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">
                              {fb.full_name?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-800">{fb.full_name}</p>
                              <p className="text-[10px] text-slate-500">{fb.designation} · {fb.role?.replace('_', ' ').toUpperCase()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">{formatDateTime(fb.created_at)}</span>
                            {canEditThisFb && (
                              <button
                                onClick={() => openEditFeedback(fb.role, fb.feedback_text)}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                                title="Edit your feedback"
                              >
                                <Pencil size={11} /> Edit
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed mt-2">{fb.feedback_text}</p>
                        
                        {/* Attachments specific to this feedback */}
                        {(() => {
                          const fbAtts = (attachments || []).filter(a => 
                            (fb.role === 'hod' && a.stage === 'hod_feedback' && a.uploader_id === fb.author_id) ||
                            (fb.role === 'imc' && a.stage === 'imc_feedback' && a.uploader_id === fb.author_id) ||
                            (fb.role === 'head_management' && a.stage === 'md_decision' && a.uploader_id === fb.author_id)
                          );
                          if (fbAtts.length === 0) return null;
                          return (
                            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                              {fbAtts.map(att => (
                                <button
                                  type="button"
                                  key={att.id}
                                  onClick={() => setPreviewFile(att)}
                                  title={att.original_filename}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-blue-700 font-medium hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm max-w-[200px]"
                                >
                                  <Paperclip size={12} className="flex-shrink-0" />
                                  <span className="truncate">{att.original_filename}</span>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}


            {/* IMC Employee Training Verification Card */}
            {canImcAct && incident.status === 'pending_training' && (
              <div className="card p-5 border-amber-300 bg-amber-50/20 shadow-sm print:hidden">
                <div className="flex items-center gap-2 mb-3 border-b border-amber-200/60 pb-3">
                  <UserCheck className="text-amber-700" size={18} />
                  <h2 className="text-sm font-bold text-amber-900 uppercase tracking-wider">Mandatory Employee Training Verification</h2>
                </div>
                <p className="text-sm text-slate-700 mb-4">
                  Management has mandated corrective training. Review the training completion status below. You can close this incident once HODs have verified their employees, or override and close it now.
                </p>
                
                {incident.responsible_employees?.filter(e => e.needs_training).length > 0 && (
                  <div className="space-y-3 mb-4">
                    {incident.responsible_employees.filter(e => e.needs_training).map(emp => (
                      <div key={emp.employee_id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{emp.full_name} ({emp.emp_id})</p>
                          <p className="text-xs text-slate-500">{emp.department_name}</p>
                        </div>
                        <div>
                          {emp.training_completed ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded-full"><CheckCircle size={14} /> Verified</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-100 text-amber-700 px-2 py-1 rounded-full"><AlertTriangle size={14} /> Pending</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <button
                  onClick={() => verifyTrainingMutation.mutate()}
                  disabled={verifyTrainingMutation.isPending}
                  className="w-full btn-primary bg-amber-600 hover:bg-amber-700 border-amber-600 text-white shadow-md py-2.5 flex items-center justify-center gap-2 font-semibold text-sm transition-all"
                >
                  {verifyTrainingMutation.isPending ? <Spinner size={16} className="text-white" /> : <CheckCircle size={16} />}
                  Confirm Training Completed & Close Incident
                </button>
              </div>
            )}

            {/* HOD Employee Outcome & Training Card */}
            {user?.role === 'hod' && hodEmployees.length > 0 && (incident.status === 'pending_training' || incident.status === 'resolved' || incident.status === 'closed') && (
              <div className="card p-5 border-blue-200 bg-blue-50/20 shadow-sm print:hidden">
                <div className="flex items-center gap-2 mb-3 border-b border-blue-200/60 pb-3">
                  <UserCheck className="text-blue-700" size={18} />
                  <h2 className="text-sm font-bold text-blue-900 uppercase tracking-wider">Department Employee Actions</h2>
                </div>
                <p className="text-sm text-slate-700 mb-4">
                  The following employees from your department are marked as responsible for this incident. Proposed Outcome: <strong>{incident.proposed_outcome}</strong>
                </p>
                <div className="space-y-3">
                  {hodEmployees.map(emp => (
                    <div key={emp.employee_id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{emp.full_name} ({emp.emp_id})</p>
                        <p className="text-xs text-slate-500">
                          {emp.needs_training ? 'Requires Training' : 'No Action Required'}
                        </p>
                      </div>
                      <div>
                        {emp.needs_training && incident.status === 'pending_training' ? (
                          emp.training_completed ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded-full"><CheckCircle size={14} /> Training Verified</span>
                          ) : (
                            <button
                              onClick={() => verifyEmployeeTrainingMutation.mutate(emp.employee_id)}
                              disabled={verifyEmployeeTrainingMutation.isPending}
                              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                            >
                              {verifyEmployeeTrainingMutation.isPending ? <Spinner size={12} /> : <CheckCircle size={14} />} Mark Training Complete
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-slate-400 italic">Noted</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* IMC Inline Review & Action Card */}
            {canImcAct && incident.status !== 'pending_training' && !feedbacks?.some(f => f.role === 'imc') && (
              <div className="card p-5 border-indigo-200 bg-indigo-50/10 print:hidden">
                {incident.status === 'redirect_requested' ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="text-orange-600 animate-pulse" size={18} />
                      <h2 className="text-sm font-semibold text-slate-800">Redirection Request Review</h2>
                    </div>
                    
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
                      <p className="text-xs text-orange-800 font-semibold uppercase tracking-wider mb-1">
                        Requested by HOD of {incident.redirect_requested_by_dept || 'Department'}
                      </p>
                      <p className="text-sm text-slate-700 italic">
                        "{incident.redirect_reason || 'No reason provided.'}"
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="field-label field-required mb-1.5 font-medium text-slate-700">Select Concern Department (Target HOD)</label>
                        <select
                          value={redirectTargetDept}
                          onChange={e => setRedirectTargetDept(e.target.value)}
                          className="select"
                        >
                          <option value="">-- Select Department --</option>
                          {departmentsList.map(d => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => setShowRejectRedirectModal(true)}
                          className="btn-secondary flex items-center gap-2 border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
                        >
                          Reject Request
                        </button>
                        <button
                          onClick={() => approveRedirectMutation.mutate()}
                          disabled={!redirectTargetDept || approveRedirectMutation.isPending}
                          className="btn-primary flex items-center gap-2 bg-orange-600 hover:bg-orange-700 border-orange-600"
                        >
                          {approveRedirectMutation.isPending && <Spinner size={14} className="text-white" />}
                          Approve & Redirect to Concern Department
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <MessageSquare className="text-indigo-600" size={18} />
                      <h2 className="text-sm font-semibold text-slate-800">Quality Review (IMC)</h2>
                    </div>
                    {!feedbacks?.some(f => f.role === 'hod') && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <Bell className="text-amber-600 flex-shrink-0 mt-0.5 animate-bounce" size={18} />
                          <div>
                            <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">HOD Feedback Pending</p>
                            <p className="text-xs text-amber-800 mt-0.5">
                              The Head of Department has not yet submitted feedback on this incident. You can remind them right now via email and system notification.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => remindHodMutation.mutate()}
                          disabled={remindHodMutation.isPending}
                          className="btn-secondary btn-sm flex items-center gap-1.5 border-amber-300 text-amber-900 hover:bg-amber-100 flex-shrink-0 shadow-sm font-semibold"
                        >
                          {remindHodMutation.isPending ? <Spinner size={13} /> : <Bell size={13} className="text-amber-600" />}
                          Send Reminder to HOD
                        </button>
                      </div>
                    )}
                    {user?.isImcLead ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4 mb-4">
                          <label className="field-label mb-0">Investigator Required?</label>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="radio" name="invReq" checked={investigatorRequired} onChange={() => setInvestigatorRequired(true)} className="w-4 h-4 text-indigo-600" />
                              <span className="text-sm text-slate-700">Yes</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="radio" name="invReq" checked={!investigatorRequired} onChange={() => setInvestigatorRequired(false)} className="w-4 h-4 text-indigo-600" />
                              <span className="text-sm text-slate-700">No</span>
                            </label>
                          </div>
                        </div>

                        {investigatorRequired ? (
                          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                            <label className="field-label mb-1">Select Investigator <span className="text-red-500">*</span></label>
                            <select
                              value={selectedInvestigator}
                              onChange={(e) => setSelectedInvestigator(e.target.value)}
                              className="select w-full"
                            >
                              <option value="">-- Choose IMC Member --</option>
                              {imcMembers.map(m => (
                                <option key={m.id} value={m.id}>{m.full_name}</option>
                              ))}
                            </select>
                            <div className="flex justify-end mt-4">
                              <button
                                onClick={() => assignInvestigatorMutation.mutate([selectedInvestigator])}
                                disabled={!selectedInvestigator || assignInvestigatorMutation.isPending}
                                className="btn-primary btn-sm"
                              >
                                {assignInvestigatorMutation.isPending ? <Spinner size={12} /> : null}
                                Assign Investigator
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div>
                              <label className="field-label mb-1">Your Review & Findings</label>
                              <textarea
                                value={feedbackText}
                                onChange={e => setFeedbackText(e.target.value)}
                                placeholder="Enter quality assessment, root cause observation, or corrective action recommendations..."
                                className="textarea"
                                rows={3}
                              />
                              <FileUploadArea files={imcAttachments} setFiles={setImcAttachments} />
                            </div>
                            <div>
                              <label className="field-label mb-1">Assign Severity <span className="text-red-500">*</span></label>
                              <select
                                value={imcSeverity}
                                onChange={(e) => setImcSeverity(e.target.value)}
                                className="select w-full"
                                required
                              >
                                <option value="">Select Severity...</option>
                                <option value="Minor">Minor</option>
                                <option value="Major">Major</option>
                                <option value="Grave">Grave</option>
                              </select>
                            </div>
                            <div>
                              <label className="field-label mb-1">Proposed Outcome <span className="text-red-500">*</span></label>
                              <select
                                value={imcProposedOutcome}
                                onChange={(e) => setImcProposedOutcome(e.target.value)}
                                className="select w-full"
                                required
                              >
                                <option value="">Select Relevant Option</option>
                                <option value="No Action">No Action</option>
                                <option value="Counselling / Education / Training">Counselling / Education / Training</option>
                                <option value="Issue a Warning Letter">Issue a Warning Letter</option>
                                <option value="Issue an Advisory Letter">Issue an Advisory Letter</option>
                                <option value="Financial Penalty">Financial Penalty</option>
                                <option value="Suspension for a Stipulated Period">Suspension for a Stipulated Period</option>
                                <option value="Transfer to Other Dept.">Transfer to Other Dept.</option>
                                <option value="Demotion">Demotion</option>
                                <option value="Termination">Termination</option>
                                <option value="Legal Action">Legal Action</option>
                                <option value="Disciplinary Committee">Disciplinary Committee</option>
                                <option value="Conflict Resolution Committee">Conflict Resolution Committee</option>
                                <option value="New Protocol and Process Flow">New Protocol and Process Flow</option>
                                <option value="Modifying Protocol and Process Flow">Modifying Protocol and Process Flow</option>
                                <option value="Inappropriate Complaint">Inappropriate Complaint</option>
                                <option value="Others">Others</option>
                              </select>
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                              <button
                                onClick={() => imcFeedbackMutation.mutate(true)}
                                disabled={!feedbackText.trim() || !imcSeverity || !imcProposedOutcome || imcFeedbackMutation.isPending}
                                className="btn-primary btn-sm"
                              >
                                {imcFeedbackMutation.isPending ? <Spinner size={12} /> : null}
                                Forward to Management
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
                        <MessageSquare className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <h3 className="text-sm font-bold text-slate-700">Awaiting Convenor Action</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          The IMC Convenor is responsible for submitting the quality review and assigning investigators.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {canInvestigatorAct && (
              <div className="card p-5 border border-indigo-200">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="text-indigo-600" size={18} />
                  <h2 className="text-sm font-semibold text-slate-800">Submit Investigation Report</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="field-label mb-1">Your Findings & Report <span className="text-red-500">*</span></label>
                    <textarea
                      value={investigatorReportText}
                      onChange={e => setInvestigatorReportText(e.target.value)}
                      placeholder="Enter the detailed investigation findings, witness statements, and analysis..."
                      className="textarea"
                      rows={4}
                    />
                    <FileUploadArea files={investigatorAttachments} setFiles={setInvestigatorAttachments} />
                  </div>
                  <div className="flex justify-end mt-4">
                    <button
                      onClick={() => investigatorReportMutation.mutate()}
                      disabled={!investigatorReportText.trim() || investigatorReportMutation.isPending}
                      className="btn-primary btn-sm"
                    >
                      {investigatorReportMutation.isPending ? <Spinner size={12} /> : null}
                      Submit Report to IMC Convenor
                    </button>
                  </div>
                </div>
              </div>
            )}

            {canImcReviewInvestigator && (
              <div className="card p-5 border border-amber-200">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare className="text-amber-600" size={18} />
                  <h2 className="text-sm font-semibold text-slate-800">Review Investigator Report</h2>
                </div>
                <div className="space-y-4">
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                    <p className="text-xs font-semibold text-amber-800 mb-2">The Investigator has submitted their report. Please review it below in the "Review History" section, then choose an action:</p>
                    
                    <div className="flex flex-col gap-3 mt-4">
                      <div>
                        <label className="field-label mb-1">Feedback to Investigator (Optional)</label>
                        <textarea
                          value={feedbackText}
                          onChange={e => setFeedbackText(e.target.value)}
                          placeholder="Provide feedback on why the report is rejected or needs more work..."
                          className="textarea"
                          rows={2}
                        />
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => rejectInvestigatorReportMutation.mutate({ action: 'reinvestigate', feedbackText })}
                          disabled={rejectInvestigatorReportMutation.isPending}
                          className="btn-secondary btn-sm text-red-600 border-red-200 hover:bg-red-50"
                        >
                          Reject & Reinvestigate (Same Person)
                        </button>
                        
                        <div className="flex gap-2 items-center">
                          <select
                            value={selectedInvestigator}
                            onChange={e => setSelectedInvestigator(e.target.value)}
                            className="select h-8 text-sm py-0"
                          >
                            <option value="">-- Select New Investigator --</option>
                            {imcMembers.map(m => (
                              <option key={m.id} value={m.id}>{m.full_name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => rejectInvestigatorReportMutation.mutate({ action: 'reassign', newInvestigatorId: selectedInvestigator, feedbackText })}
                            disabled={!selectedInvestigator || rejectInvestigatorReportMutation.isPending}
                            className="btn-secondary btn-sm text-orange-600 border-orange-200 hover:bg-orange-50"
                          >
                            Reassign to New Person
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-800 mb-2">Accept & Proceed to Management</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="field-label mb-1">Final Quality Review & Findings</label>
                        <textarea
                          value={feedbackText}
                          onChange={e => setFeedbackText(e.target.value)}
                          placeholder="Enter your final quality assessment..."
                          className="textarea"
                          rows={3}
                        />
                        <FileUploadArea files={imcAttachments} setFiles={setImcAttachments} />
                      </div>
                      <div>
                        <label className="field-label mb-1">Assign Severity <span className="text-red-500">*</span></label>
                        <select
                          value={imcSeverity}
                          onChange={(e) => setImcSeverity(e.target.value)}
                          className="select w-full"
                          required
                        >
                          <option value="">Select Severity...</option>
                          <option value="Minor">Minor</option>
                          <option value="Major">Major</option>
                          <option value="Grave">Grave</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label mb-1">Proposed Outcome <span className="text-red-500">*</span></label>
                        <select
                          value={imcProposedOutcome}
                          onChange={(e) => setImcProposedOutcome(e.target.value)}
                          className="select w-full"
                          required
                        >
                          <option value="">Select Relevant Option</option>
                          <option value="No Action">No Action</option>
                          <option value="Counselling / Education / Training">Counselling / Education / Training</option>
                          <option value="Issue a Warning Letter">Issue a Warning Letter</option>
                          <option value="Issue an Advisory Letter">Issue an Advisory Letter</option>
                          <option value="Financial Penalty">Financial Penalty</option>
                          <option value="Suspension for a Stipulated Period">Suspension for a Stipulated Period</option>
                          <option value="Transfer to Other Dept.">Transfer to Other Dept.</option>
                          <option value="Demotion">Demotion</option>
                          <option value="Termination">Termination</option>
                          <option value="Legal Action">Legal Action</option>
                          <option value="Disciplinary Committee">Disciplinary Committee</option>
                          <option value="Conflict Resolution Committee">Conflict Resolution Committee</option>
                          <option value="New Protocol and Process Flow">New Protocol and Process Flow</option>
                          <option value="Modifying Protocol and Process Flow">Modifying Protocol and Process Flow</option>
                          <option value="Inappropriate Complaint">Inappropriate Complaint</option>
                          <option value="Others">Others</option>
                        </select>
                      </div>
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => imcFeedbackMutation.mutate(true)}
                          disabled={!feedbackText.trim() || !imcSeverity || !imcProposedOutcome || imcFeedbackMutation.isPending}
                          className="btn-primary btn-sm bg-green-600 hover:bg-green-700 border-green-600"
                        >
                          {imcFeedbackMutation.isPending ? <Spinner size={12} /> : null}
                          Accept Report & Forward to Management
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {user?.role === 'employee' && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-slate-800 mb-3">Current Status</h2>
                <StatusMessage status={incident.status} />
              </div>
            )}

            {finalReport && (
              <div className="card p-5 border-green-500 bg-green-50/30">
                <div className="flex items-start gap-3">
                  <CheckCircle size={18} className="text-green-700 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h2 className="text-sm font-semibold text-slate-800 mb-2">Final Report</h2>
                    <p className="text-xs text-slate-500 mb-2">Fault Type: <strong>{finalReport.fault_type}</strong></p>
                    <p className="text-sm text-slate-700 leading-relaxed">{finalReport.corrective_actions}</p>
                    <p className="text-xs text-slate-400 mt-2">Generated {formatDateTime(finalReport.generated_at)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <InteractiveTimeline
              incident={incident}
              feedbacks={feedbacks}
              attachments={attachments}
              finalReport={finalReport}
              onViewAttachment={(att) => setPreviewFile(att)}
            />
          </div>
        </div>
      </div>

      {zoomedFeedback && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-fade-in print:hidden" onClick={() => setZoomedFeedback(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-xl font-bold text-indigo-700">
                  {zoomedFeedback.full_name?.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{zoomedFeedback.full_name}</h3>
                  <p className="text-sm font-medium text-slate-500">{zoomedFeedback.designation} · {zoomedFeedback.role?.replace('_', ' ').toUpperCase()}</p>
                </div>
              </div>
              <button onClick={() => setZoomedFeedback(null)} className="btn-ghost p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors">
                ✕
              </button>
            </div>
            <div className="p-8 overflow-y-auto">
              <p className="text-2xl lg:text-3xl font-medium text-slate-800 leading-relaxed italic border-l-4 border-indigo-300 pl-6 py-2">
                "{zoomedFeedback.feedback_text}"
              </p>
              <div className="mt-8 text-right">
                <p className="text-sm text-slate-400 font-medium">Submitted on: {formatDateTime(zoomedFeedback.created_at)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <WithdrawModal
        show={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        withdrawReason={withdrawReason}
        setWithdrawReason={setWithdrawReason}
        mutate={() => withdrawMutation.mutate()}
        isPending={withdrawMutation.isPending}
      />
      <HodFeedbackModal
        show={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        feedbackText={feedbackText}
        setFeedbackText={setFeedbackText}
        hodAcknowledged={hodAcknowledged}
        setHodAcknowledged={setHodAcknowledged}
        hodAttachments={hodAttachments}
        setHodAttachments={setHodAttachments}
        mutate={() => hodFeedbackMutation.mutate()}
        isPending={hodFeedbackMutation.isPending}
        canHodFeedback={canHodFeedback}
      />
      <ManagementDecisionModal
        show={showMdModal}
        onClose={() => setShowMdModal(false)}
        mdFaultType={mdFaultType}
        setMdFaultType={setMdFaultType}
        mdActions={mdActions}
        setMdActions={setMdActions}
        mdRequireTraining={mdRequireTraining}
        setMdRequireTraining={setMdRequireTraining}
        mdResponsibleEmployees={mdResponsibleEmployees}
        setMdResponsibleEmployees={setMdResponsibleEmployees}
        mdAttachments={mdAttachments}
        setMdAttachments={setMdAttachments}
        mdProposedOutcome={mdProposedOutcome}
        setMdProposedOutcome={setMdProposedOutcome}
        incidentProposedOutcome={incident?.proposed_outcome}
        mutate={() => mdMutation.mutate()}
        isPending={mdMutation.isPending}
      />
      <AssignInvestigatorModal
        show={showAssignInvestigatorModal}
        onClose={() => setShowAssignInvestigatorModal(false)}
        mutate={(ids) => assignInvestigatorMutation.mutate(ids)}
        isPending={assignInvestigatorMutation.isPending}
      />
      <ReopenModal
        show={showReopenModal}
        onClose={() => setShowReopenModal(false)}
        reopenReason={reopenReason}
        setReopenReason={setReopenReason}
        mutate={() => reopenMutation.mutate()}
        isPending={reopenMutation.isPending}
      />
      <RedirectIncidentModal
        show={showRedirectModal}
        onClose={() => setShowRedirectModal(false)}
        redirectReason={redirectReason}
        setRedirectReason={setRedirectReason}
        mutate={() => requestRedirectMutation.mutate()}
        isPending={requestRedirectMutation.isPending}
      />
      <RejectRedirectModal
        show={showRejectRedirectModal}
        onClose={() => setShowRejectRedirectModal(false)}
        rejectRedirectReason={rejectRedirectReason}
        setRejectRedirectReason={setRejectRedirectReason}
        mutate={() => rejectRedirectMutation.mutate()}
        isPending={rejectRedirectMutation.isPending}
      />
      <EditFeedbackModal
        editFbModal={editFbModal}
        onClose={() => { setEditFbModal(null); setEditFbText(''); }}
        editFbText={editFbText}
        setEditFbText={setEditFbText}
        mutate={(data) => editFeedbackMutation.mutate(data)}
        isPending={editFeedbackMutation.isPending}
      />
      <EditIncidentModal
        show={showEditIncModal}
        onClose={() => setShowEditIncModal(false)}
        editInc={editInc}
        setEditInc={setEditInc}
        mutate={(data) => editIncidentMutation.mutate(data)}
        isPending={editIncidentMutation.isPending}
      />
      <ImcReportModal
        show={showImcReportModal}
        onClose={() => setShowImcReportModal(false)}
        attachments={imcAttachments}
        setAttachments={setImcAttachments}
        mutate={() => imcReportMutation.mutate()}
        isPending={imcReportMutation.isPending}
      />
      <FilePreviewModal
        previewFile={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </>
  );
}
