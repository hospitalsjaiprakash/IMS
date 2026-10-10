import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { incidentsApi, metaApi, authApi, UPLOADS_URL } from '../../api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { ArrowLeft, Clock, Calendar, CheckCircle, AlertTriangle, MessageSquare, UserCheck, Bell, Pencil, Paperclip, Shield, Users, ShieldCheck, FileText } from 'lucide-react';
import { Alert, Spinner, Breadcrumbs, SkeletonDetail, SearchableMultiSelect } from '../../components/ui';
import { formatDateTime } from '../../utils/helpers';

import IncidentHeader from '../../components/incident-detail/IncidentHeader';
import IncidentDetailsCard from '../../components/incident-detail/IncidentDetailsCard';
import InteractiveTimeline from '../../components/incident-detail/InteractiveTimeline';
import IncidentActions from '../../components/incident-detail/IncidentActions';
import FileUploadArea from '../../components/incident-detail/FileUploadArea';
import InvestigatorPicker, { isImcUser } from '../../components/incident-detail/InvestigatorPicker';

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
  ImcReportModal,
  InvolveDepartmentModal
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
  submitted: 0, with_hod: 1, with_hod_and_imc: 1, with_imc: 2, with_investigator: 2, with_imc_review: 2,
  redirect_requested: 2, with_head_management: 3, pending_imc_report: 4, pending_training: 5, resolved: 6, closed: 6,
};

function StatusMessage({ status }) {
  const msgs = {
    submitted: { type: 'info', msg: 'Your incident has been submitted successfully and is awaiting HOD feedback.' },
    with_hod: { type: 'info', msg: 'Your incident has been routed to the Head of Department and is currently awaiting their review and feedback.' },
    with_hod_and_imc: { type: 'info', msg: 'Due to grave severity, your incident is currently awaiting simultaneous review and feedback from both the HOD and IMC.' },
    with_imc: { type: 'info', msg: 'Your incident is currently awaiting review and feedback from the Incident Management Committee.' },
    with_investigator: { type: 'info', msg: 'An investigation team has been assigned and is currently conducting a root-cause investigation.' },
    with_imc_review: { type: 'info', msg: 'The joint investigation report has been submitted and is currently being evaluated by the IMC Convenor.' },
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
  const [redirectReason, setRedirectReason] = useState('');
  const [redirectTargetDepts, setRedirectTargetDepts] = useState([]);
  const [retainRequestingDept, setRetainRequestingDept] = useState(false);
  const [rejectRedirectReason, setRejectRedirectReason] = useState('');
  const [showInvolveDeptModal, setShowInvolveDeptModal] = useState(false);

  const [hodAttachments, setHodAttachments] = useState([]);
  const [imcAttachments, setImcAttachments] = useState([]);
  const [mdAttachments, setMdAttachments] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);

  // Investigator States
  const [investigatorRequired, setInvestigatorRequired] = useState(false);
  const [selectedInvestigator, setSelectedInvestigator] = useState('');
  const [primaryInvestigators, setPrimaryInvestigators] = useState([]);
  const [secondaryInvestigators, setSecondaryInvestigators] = useState([]);
  const [investigatorReportText, setInvestigatorReportText] = useState('');
  const [investigatorAttachments, setInvestigatorAttachments] = useState([]);
  const [satisfactionDecision, setSatisfactionDecision] = useState('satisfied'); // 'satisfied' | 'unsatisfied'
  const [reassignMode, setReassignMode] = useState(false);
  const [reassignPrimary, setReassignPrimary] = useState([]);
  const [reassignSecondary, setReassignSecondary] = useState([]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setShowWithdrawModal(false);
        setShowFeedbackModal(false);
        setShowMdModal(false);
        setShowReopenModal(false);
        setShowRedirectModal(false);
        setShowRejectRedirectModal(false);
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
      if (mdActions) {
        fd.append('notes', mdActions);
        fd.append('correctiveActions', mdActions);
      }
      if (mdProposedOutcome) fd.append('proposedOutcome', mdProposedOutcome);
      mdAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.managementAction(id, fd);
    },
    onSuccess: () => {
      toast.success('Management action submitted.');
      setShowMdModal(false);
      setMdAttachments([]);
      setMdActions('');
      setMdProposedOutcome('');
      refetch();
    }
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
    onSuccess: () => {
      toast.success('Investigators assigned successfully.');
      setPrimaryInvestigators([]);
      setSecondaryInvestigators([]);
      setInvestigatorRequired(false);
      refetch();
    },
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
    onSuccess: () => {
      toast.success('Reinvestigation requested successfully.');
      setFeedbackText('');
      setReassignPrimary([]);
      setReassignSecondary([]);
      setReassignMode(false);
      refetch();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to submit action')
  });

  const isConvenor = Boolean(user?.is_imc_lead || user?.isImcLead || user?.is_system_admin || user?.role === 'system_admin');
  const { data: imcMembers = [] } = useQuery({
    queryKey: ['imcMembers'],
    queryFn: () => authApi.getCommitteeMembers().then(res => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.members || []);
      return list.filter(isImcUser);
    }),
    enabled: isConvenor
  });

  const editFeedbackMutation = useMutation({
    mutationFn: ({ feedbackType, feedbackText: ft, feedbackId }) =>
      incidentsApi.editFeedback(id, { feedbackType, feedbackText: ft, feedbackId }),
    onSuccess: () => {
      toast.success('Feedback updated.');
      setEditFbModal(null);
      setEditFbText('');
      refetch();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Failed to update feedback.');
    }
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
    mutationFn: () => incidentsApi.approveRedirect(id, { 
      targetDepartments: redirectTargetDepts,
      actionType: retainRequestingDept ? 'partial' : 'full'
    }),
    onSuccess: () => { 
      toast.success('Incident successfully redirected.'); 
      setRedirectTargetDepts([]); 
      setRetainRequestingDept(false);
      refetch(); 
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to redirect incident')
  });

  const involveDepartmentsMutation = useMutation({
    mutationFn: (departmentIds) => incidentsApi.involveDepartments(id, { departmentIds }),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Additional department(s) successfully involved.');
      setShowInvolveDeptModal(false);
      refetch();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to involve departments')
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

  const openEditFeedback = (feedbackType, currentText, feedbackId) => {
    setEditFbModal({ feedbackType, feedbackId });
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

  useEffect(() => {
    const inc = data?.incident;
    if (inc?.status === 'with_investigator' && inc?.latest_investigation_report?.feedback_text && !investigatorReportText) {
      setInvestigatorReportText(inc.latest_investigation_report.feedback_text);
    }
  }, [data?.incident?.status, data?.incident?.latest_investigation_report?.feedback_text]);

  if (isLoading) return <SkeletonDetail />;
  if (error || !data) return <Alert type="error" title="Not found" message="Incident not found or access denied." />;

  const { incident, feedbacks, attachments, finalReport } = data;

  const latestInvReport = incident.latest_investigation_report || feedbacks?.filter(f => f.role === 'investigator').pop() || null;
  const investigationAttachmentsList = incident.investigation_attachments?.length > 0 
    ? incident.investigation_attachments 
    : (attachments?.filter(a => a.stage === 'investigator_report') || []);

  const hasImcFeedback = feedbacks?.some(f => f.role === 'imc');
  const canWithdraw = user?.id === incident.reporter_id && ['submitted', 'with_hod'].includes(incident.status);

  // Rule 1: HOD of all concerned departments (or user who requested redirect) can add feedback
  // Rule 4: HOD feedback cannot be added after IMC has provided feedback
  const isTargetOrRequestedUser = Boolean(
    incident.is_target_hod || 
    (incident.redirect_requested_by_user_id && incident.redirect_requested_by_user_id === user?.id)
  );

  const isHodRole = ['hod', 'asst_coo', 'coo'].includes(user?.role) || (user?.role === 'employee' && isTargetOrRequestedUser);

  // If redirect was rejected, the user who requested redirection or target HOD must be able to give feedback, even if they originally reported the incident
  const isReporterAllowed = (!incident.redirect_rejected_at ? user?.id !== incident.reporter_id : true);

  const canHodFeedback =
    isHodRole &&
    isTargetOrRequestedUser &&
    isReporterAllowed &&
    ['submitted', 'with_hod', 'with_hod_and_imc'].includes(incident.status) &&
    !incident.user_hod_dept_submitted &&
    !hasImcFeedback;

  const canRequestRedirect =
    isHodRole &&
    isTargetOrRequestedUser &&
    user?.id !== incident.reporter_id &&
    !incident.redirect_rejected_at &&
    ['submitted', 'with_hod', 'with_hod_and_imc'].includes(incident.status) &&
    !incident.user_hod_dept_submitted &&
    !hasImcFeedback;

  const isLead = Boolean(user?.is_imc_lead || user?.isImcLead || user?.is_system_admin || user?.role === 'system_admin');
  const isImcMember = Boolean(user?.role === 'imc' || user?.is_imc_member || user?.isImcMember || isLead);

  const canImcAct =
    isLead &&
    user?.id !== incident.reporter_id &&
    (['with_imc', 'with_hod_and_imc', 'redirect_requested', 'pending_training'].includes(incident.status) ||
      (incident.status === 'resolved' && incident.has_responsible_person && !incident.training_completed));

  const canInvolveDepartments =
    isLead &&
    user?.id !== incident.reporter_id &&
    ['with_imc', 'with_hod', 'with_hod_and_imc', 'redirect_requested'].includes(incident.status);

  const canMdAct = user?.role === 'head_management' && user?.id !== incident.reporter_id && incident.status === 'with_head_management';
  const canReopen = (user?.role === 'head_management' || user?.role === 'imc') && user?.id !== incident.reporter_id && ['resolved', 'closed'].includes(incident.status);
  const canEscalate = (user?.role === 'head_management' || user?.role === 'imc') && user?.id !== incident.reporter_id && !['resolved', 'closed', 'withdrawn'].includes(incident.status) && !incident.priority_escalated_by;

  // Remind HOD if any concerned department HOD has not yet submitted feedback
  const canRemindHod =
    (user?.role === 'head_management' || user?.role === 'imc') &&
    user?.id !== incident.reporter_id &&
    !['resolved', 'closed', 'withdrawn'].includes(incident.status) &&
    !incident.all_hod_feedback_submitted;

  const myInvestigationAssignment = incident.investigators?.find(i => i.investigator_id === user?.id);
  const isAssignedInvestigator = Boolean(myInvestigationAssignment);
  const isAssignedPrimary = Boolean(
    isAssignedInvestigator && (
      myInvestigationAssignment.role === 'imc' ||
      myInvestigationAssignment.is_imc_member ||
      myInvestigationAssignment.is_imc_lead ||
      isImcMember
    )
  );
  const isAssignedSecondary = Boolean(isAssignedInvestigator && !isAssignedPrimary && !isImcMember);
  const hasInvestigatorsAssigned = Boolean(incident.investigators && incident.investigators.length > 0);
  const allInvestigatorsCompleted = Boolean(incident.all_investigators_submitted || (hasInvestigatorsAssigned && incident.investigators.every(i => i.status === 'completed')));
  const canInvestigatorAct = incident.status === 'with_investigator' && (isAssignedPrimary || isImcMember);
  const canImcReviewInvestigator = isLead && (incident.status === 'with_imc_review' || (incident.status === 'with_investigator' && hasInvestigatorsAssigned && allInvestigatorsCompleted));
  const canGenerateImcReport = ['imc', 'system_admin'].includes(user?.role) && isLead && incident.status === 'pending_imc_report';
  const canCloseIncident = isLead && incident.status === 'pending_training';

  const isHodOfDept = (deptName) => {
    if (!user) return false;
    return departmentsList.some(d => d.name === deptName && (d.assigned_user_id === user.id || (!d.assigned_user_id && d.hod_user_id === user.id)));
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
            canGenerateImcReport={canGenerateImcReport}
            canCloseIncident={canCloseIncident}
            canInvolveDepartments={canInvolveDepartments}
            setShowWithdrawModal={setShowWithdrawModal}
            setShowFeedbackModal={setShowFeedbackModal}
            setShowRedirectModal={setShowRedirectModal}
            setShowMdModal={setShowMdModal}
            setShowReopenModal={setShowReopenModal}
            setShowImcReportModal={setShowImcReportModal}
            setShowInvolveDeptModal={setShowInvolveDeptModal}
            openEditIncident={openEditIncident}
            escalateMutation={escalateMutation}
            remindHodMutation={remindHodMutation}
            closeIncidentMutation={closeIncidentMutation}
          />
        }
      />

      {/* Redirection Rejected Alert Banner */}
      {incident.redirect_rejected_at && (
        <div className="mb-4 bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm animate-fade-in print:hidden">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-amber-900">
                Department Redirection Request Rejected
              </h4>
              <p className="text-xs text-amber-800 mt-1">
                <strong>Reason:</strong> {incident.redirect_rejected_reason || 'The redirection request was rejected by IMC. Please provide your department feedback.'}
              </p>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-[11px] text-amber-700">
                  Rejected on {formatDateTime(incident.redirect_rejected_at)}
                </span>
                {canHodFeedback && (
                  <button
                    onClick={() => setShowFeedbackModal(true)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                  >
                    Provide Department Feedback Now
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                    // Rule 2: No one can edit the review/feedback given by any other person, except the person itself.
                    // Rule 5: After IMC has given the feedback, the feedbacks given by the HODs of concerned department can not be modified.
                    const isAuthor = fb.author_id === user?.id;
                    const isLockedHod = fb.role === 'hod' && hasImcFeedback;
                    const canEditThisFb = isAuthor && !isLockedHod;
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
                              <p className="text-[10px] text-slate-500">
                                {fb.designation} {fb.dept_name ? `· ${fb.dept_name}` : ''} · {fb.role?.replace('_', ' ').toUpperCase()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">{formatDateTime(fb.created_at)}</span>
                            {canEditThisFb && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditFeedback(fb.role, fb.feedback_text, fb.id);
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                                title="Edit your feedback"
                              >
                                <Pencil size={11} /> Edit
                              </button>
                            )}
                            {isAuthor && isLockedHod && (
                              <span className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-lg" title="HOD feedback cannot be edited after IMC has provided feedback">
                                Locked
                              </span>
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
                        <label className="field-label field-required mb-1.5 font-medium text-slate-700">
                          Select Concern Department(s) (Target HODs)
                        </label>
                        <SearchableMultiSelect
                          options={departmentsList.map(d => d.name)}
                          value={redirectTargetDepts}
                          onChange={setRedirectTargetDepts}
                          placeholder="Search and select one or more concern departments…"
                        />
                        <p className="text-xs text-slate-500 mt-1.5">
                          You can select multiple departments. The HOD of each selected department will review and provide feedback.
                        </p>
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
                          disabled={redirectTargetDepts.length === 0 || approveRedirectMutation.isPending}
                          className="btn-primary flex items-center gap-2 bg-orange-600 hover:bg-orange-700 border-orange-600"
                        >
                          {approveRedirectMutation.isPending && <Spinner size={14} className="text-white" />}
                          Approve & Redirect to Concern Department(s)
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
                    {!incident.all_hod_feedback_submitted && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <Bell className="text-amber-600 flex-shrink-0 mt-0.5 animate-bounce" size={18} />
                          <div>
                            <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                              Concerned Department HOD Feedback Pending
                            </p>
                            <p className="text-xs text-amber-800 mt-0.5">
                              {incident.pending_hod_departments?.length > 0 ? (
                                <>Awaiting feedback from HOD of: <strong>{incident.pending_hod_departments.join(', ')}</strong>. </>
                              ) : (
                                <>Concerned HOD has not yet submitted feedback. </>
                              )}
                              Per hospital policy, IMC Quality Review unlocks only after all concerned HODs have submitted feedback.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => remindHodMutation.mutate()}
                          disabled={remindHodMutation.isPending}
                          className="btn-secondary btn-sm flex items-center gap-1.5 border-amber-300 text-amber-900 hover:bg-amber-100 flex-shrink-0 shadow-sm font-semibold"
                        >
                          {remindHodMutation.isPending ? <Spinner size={13} /> : <Bell size={13} className="text-amber-600" />}
                          Send Reminder to Pending HOD(s)
                        </button>
                      </div>
                    )}
                    {isLead ? (
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
                          <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 space-y-5">
                            <InvestigatorPicker
                              id="primary-investigator-search"
                              label="Select Primary Investigator(s) — IMC Members"
                              icon={Shield}
                              required
                              mode="imc"
                              imcMembers={imcMembers}
                              selected={primaryInvestigators}
                              onChange={setPrimaryInvestigators}
                              placeholder="Type IMC member name or employee ID…"
                              accent="indigo"
                            />
                            <div className="border-t border-indigo-100" />
                            <InvestigatorPicker
                              id="secondary-investigator-search"
                              label="Select Secondary Investigator(s) — Non-IMC Employees"
                              icon={Users}
                              mode="non_imc"
                              imcMembers={imcMembers}
                              selected={secondaryInvestigators}
                              onChange={setSecondaryInvestigators}
                              excludeIds={[
                                ...primaryInvestigators.map(p => p.id),
                                ...primaryInvestigators.map(p => p.employee_id)
                              ].filter(Boolean)}
                              placeholder="Type employee name or employee ID…"
                              accent="blue"
                            />
                            <div className="flex justify-end">
                              <button
                                onClick={() => assignInvestigatorMutation.mutate([
                                  ...primaryInvestigators.map(p => p.id || p.employee_id),
                                  ...secondaryInvestigators.map(s => s.id || s.employee_id)
                                ])}
                                disabled={!incident.all_hod_feedback_submitted || primaryInvestigators.length === 0 || assignInvestigatorMutation.isPending}
                                title={
                                  !incident.all_hod_feedback_submitted
                                    ? `Disabled: Awaiting feedback from HOD of: ${incident.pending_hod_departments?.join(', ')}`
                                    : primaryInvestigators.length === 0 ? 'Select at least one primary investigator (IMC member)' : ''
                                }
                                className="btn-primary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {assignInvestigatorMutation.isPending ? <Spinner size={12} /> : null}
                                Assign Investigator(s) ({primaryInvestigators.length + secondaryInvestigators.length})
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
                                disabled={!incident.all_hod_feedback_submitted || !feedbackText.trim() || !imcSeverity || !imcProposedOutcome || imcFeedbackMutation.isPending}
                                className="btn-primary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                title={!incident.all_hod_feedback_submitted ? `Disabled: Awaiting feedback from HOD of: ${incident.pending_hod_departments?.join(', ')}` : ''}
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

            {/* 1. Investigation Team Status Card (Visible while investigation is in progress) */}
            {incident.status === 'with_investigator' && hasInvestigatorsAssigned && (
              <div className="card p-5 border border-indigo-200 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="text-indigo-600" size={18} />
                    <h2 className="text-sm font-bold text-slate-800">Investigation Panel in Progress</h2>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                    Awaiting Centralized Report
                  </span>
                </div>

                <p className="text-xs text-slate-600">
                  The IMC Convenor has appointed the following investigation panel to investigate as a collective team. A single centralized investigation report will be submitted by the Primary Investigator(s) on behalf of the panel.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {incident.investigators.map(inv => {
                    const isPrimary = Boolean(inv.role === 'imc' || inv.is_imc_member || inv.is_imc_lead);
                    return (
                      <div
                        key={inv.id || inv.investigator_id}
                        className="p-3 rounded-xl border bg-white border-slate-200 shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-800 truncate">
                                {inv.full_name}
                              </span>
                              {inv.employee_id && (
                                <span className="text-[11px] text-slate-500 font-mono">
                                  ({inv.employee_id})
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  isPrimary
                                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                    : 'bg-blue-100 text-blue-700 border border-blue-200'
                                }`}
                              >
                                {isPrimary ? 'Primary (IMC)' : 'Secondary'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                              {[inv.designation, inv.department].filter(Boolean).join(' • ') || 'Hospital Staff'}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                            <Clock size={11} /> Investigating
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isAssignedSecondary && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex items-center gap-2">
                    <Users size={16} className="text-blue-600 flex-shrink-0" />
                    <span>
                      You are assigned as a Secondary Investigator on this panel. The Primary Investigator(s) will compile and submit the centralized investigation report on behalf of the team.
                    </span>
                  </div>
                )}

                {!isAssignedPrimary && !isAssignedSecondary && !isImcMember && (
                  <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 flex items-center gap-2">
                    <Clock size={15} className="text-slate-500 flex-shrink-0" />
                    <span>
                      Investigation in progress. Awaiting joint report submission from the primary investigator(s).
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 2. Centralized Joint Investigation Report Form (Primary Investigator on behalf of panel) */}
            {canInvestigatorAct && (
              <div className="card p-5 border border-indigo-300 bg-white shadow-sm space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="text-indigo-600" size={18} />
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Submit Joint Investigation Report</h2>
                      <p className="text-xs text-slate-500">Submitting on behalf of the entire investigation panel</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                    Primary Investigator
                  </span>
                </div>

                <p className="text-xs text-slate-600">
                  As an assigned Primary Investigator, provide the unified findings and root-cause analysis agreed upon by the panel. Submitting this centralized report will complete the investigation on behalf of all assigned members and forward the case to the IMC Convenor.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="field-label mb-1">
                      Detailed Investigation Findings & Explanation <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={investigatorReportText}
                      onChange={e => setInvestigatorReportText(e.target.value)}
                      placeholder="Provide a detailed explanation of the investigation findings, root cause analysis, sequence of events, and panel observations..."
                      className="textarea"
                      rows={5}
                      required
                    />
                  </div>

                  <div>
                    <label className="field-label mb-1">
                      Supporting Attachments (Optional)
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Upload any on-site photographs, evidence, or supporting documents (non-mandatory).
                    </p>
                    <FileUploadArea files={investigatorAttachments} setFiles={setInvestigatorAttachments} />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => investigatorReportMutation.mutate()}
                      disabled={!investigatorReportText.trim() || investigatorReportMutation.isPending}
                      className="btn-primary btn-sm flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {investigatorReportMutation.isPending ? <Spinner size={12} /> : null}
                      Submit Joint Report to IMC Convenor
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Review Investigator Reports & IMC Convenor Decision Card */}
            {canImcReviewInvestigator && (
              <div className="card p-5 border border-indigo-300 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="text-indigo-600" size={18} />
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">IMC Convenor Review of Investigation</h2>
                      <p className="text-xs text-slate-500">Joint investigation report has been submitted by the panel. Evaluate findings below.</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Joint Report Submitted
                  </span>
                </div>

                {/* Unified Joint Investigation Report */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Joint Investigation Findings (Submitted on Behalf of Panel)
                    </h3>
                    {latestInvReport?.created_at && (
                      <span className="text-[11px] text-slate-400">
                        Submitted {formatDateTime(latestInvReport.created_at)}
                      </span>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border border-indigo-100 bg-white shadow-2xs space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                          {latestInvReport?.full_name?.charAt(0) || 'P'}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-800">
                            {latestInvReport?.full_name || 'Primary Investigator'}
                          </span>
                          <span className="text-[11px] text-slate-500 ml-1.5">
                            ({latestInvReport?.designation || 'Lead Primary Investigator'})
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
                        Submitted on Behalf of Team
                      </span>
                    </div>

                    {/* Appointed Panel Roster */}
                    {incident.investigators?.length > 0 && (
                      <div className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Investigation Panel:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {incident.investigators.map(inv => {
                            const isPrimary = Boolean(inv.role === 'imc' || inv.is_imc_member || inv.is_imc_lead);
                            return (
                              <span
                                key={inv.id || inv.investigator_id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px]"
                              >
                                <span className="font-semibold text-slate-700">{inv.full_name}</span>
                                {inv.employee_id && <span className="text-[10px] text-slate-400 font-mono">({inv.employee_id})</span>}
                                <span className={`text-[9px] font-bold px-1 py-0.2 rounded ${
                                  isPrimary ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {isPrimary ? 'Primary' : 'Secondary'}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                      <p className="text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                        Investigation Findings & Analysis:
                      </p>
                      <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {latestInvReport?.feedback_text || incident.investigators?.find(i => i.report_text)?.report_text || 'No report text provided.'}
                      </p>
                    </div>

                    {/* Evidence Attachments */}
                    {investigationAttachmentsList.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                          <Paperclip size={13} className="text-indigo-600" />
                          Attached Evidence & Documents ({investigationAttachmentsList.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {investigationAttachmentsList.map(att => (
                            <a
                              key={att.id}
                              href={`${UPLOADS_URL}/${att.stored_filename}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-700 transition-colors shadow-2xs"
                            >
                              <FileText size={13} className="text-indigo-600" />
                              <span className="truncate max-w-[200px]">{att.original_filename}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lead Satisfaction Decision */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Are you satisfied with the investigation done by the investigators?
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSatisfactionDecision('satisfied')}
                      className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                        satisfactionDecision === 'satisfied'
                          ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 mt-0.5">
                        <CheckCircle size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Yes, Satisfied</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Accept investigation findings and submit report directly to Management.</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSatisfactionDecision('unsatisfied')}
                      className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                        satisfactionDecision === 'unsatisfied'
                          ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="p-2 rounded-lg bg-amber-100 text-amber-700 mt-0.5">
                        <AlertTriangle size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">No, Need Re-investigation</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Findings incomplete or unsatisfactory. Mandate re-investigation.</p>
                      </div>
                    </button>
                  </div>

                  {/* BRANCH 1: Unsatisfied -> Mandate Reinvestigation */}
                  {satisfactionDecision === 'unsatisfied' && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-4 bg-amber-50/40 p-4 rounded-xl border border-amber-200">
                      <div>
                        <label className="field-label mb-1">
                          Remarks & Re-investigation Instructions <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={feedbackText}
                          onChange={e => setFeedbackText(e.target.value)}
                          placeholder="Explain why the investigation is unsatisfactory and what additional points/witnesses need investigation..."
                          className="textarea"
                          rows={3}
                          required
                        />
                      </div>

                      <div className="space-y-3">
                        <label className="field-label mb-0">Who should re-investigate?</label>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700">
                            <input
                              type="radio"
                              name="reinvMode"
                              checked={!reassignMode}
                              onChange={() => setReassignMode(false)}
                              className="w-4 h-4 text-amber-600"
                            />
                            Send back to Same Team
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700">
                            <input
                              type="radio"
                              name="reinvMode"
                              checked={reassignMode}
                              onChange={() => setReassignMode(true)}
                              className="w-4 h-4 text-amber-600"
                            />
                            Re-assign / Modify Investigators
                          </label>
                        </div>

                        {reassignMode && (
                          <div className="bg-white border border-amber-200 rounded-xl p-4 space-y-4 mt-3">
                            <InvestigatorPicker
                              id="reassign-primary"
                              label="Select Primary Investigator(s) — IMC Members"
                              icon={Shield}
                              required
                              mode="imc"
                              imcMembers={imcMembers}
                              selected={reassignPrimary}
                              onChange={setReassignPrimary}
                              placeholder="Type IMC member name or employee ID…"
                              accent="indigo"
                            />
                            <InvestigatorPicker
                              id="reassign-secondary"
                              label="Select Secondary Investigator(s) — Non-IMC Employees"
                              icon={Users}
                              mode="non_imc"
                              imcMembers={imcMembers}
                              selected={reassignSecondary}
                              onChange={setReassignSecondary}
                              excludeIds={[
                                ...reassignPrimary.map(p => p.id),
                                ...reassignPrimary.map(p => p.employee_id)
                              ].filter(Boolean)}
                              placeholder="Type employee name or employee ID…"
                              accent="blue"
                            />
                          </div>
                        )}

                        <div className="flex justify-end pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (reassignMode) {
                                rejectInvestigatorReportMutation.mutate({
                                  action: 'reassign',
                                  feedbackText,
                                  investigatorIds: [
                                    ...reassignPrimary.map(p => p.id || p.employee_id),
                                    ...reassignSecondary.map(s => s.id || s.employee_id)
                                  ]
                                });
                              } else {
                                rejectInvestigatorReportMutation.mutate({
                                  action: 'reinvestigate',
                                  feedbackText
                                });
                              }
                            }}
                            disabled={
                              !feedbackText.trim() ||
                              (reassignMode && reassignPrimary.length === 0) ||
                              rejectInvestigatorReportMutation.isPending
                            }
                            className="btn-primary btn-sm bg-amber-600 hover:bg-amber-700 border-amber-600 disabled:opacity-50"
                          >
                            {rejectInvestigatorReportMutation.isPending ? <Spinner size={12} /> : null}
                            {reassignMode ? 'Re-assign & Send for Re-investigation' : 'Send for Re-investigation (Same Team)'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BRANCH 2: Satisfied -> Submit to Management */}
                  {satisfactionDecision === 'satisfied' && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-4 bg-emerald-50/40 p-4 rounded-xl border border-emerald-200">
                      <div>
                        <label className="field-label mb-1">
                          Final IMC Quality Assessment & Findings <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={feedbackText}
                          onChange={e => setFeedbackText(e.target.value)}
                          placeholder="Enter comprehensive IMC review, root cause findings, and quality observations to be forwarded to Management..."
                          className="textarea"
                          rows={3}
                          required
                        />
                        <FileUploadArea files={imcAttachments} setFiles={setImcAttachments} />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="field-label mb-1">Assign Severity <span className="text-red-500">*</span></label>
                          <select
                            value={imcSeverity}
                            onChange={e => setImcSeverity(e.target.value)}
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
                            onChange={e => setImcProposedOutcome(e.target.value)}
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
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => imcFeedbackMutation.mutate(true)}
                          disabled={
                            !feedbackText.trim() ||
                            !imcSeverity ||
                            !imcProposedOutcome ||
                            imcFeedbackMutation.isPending
                          }
                          className="btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700 border-emerald-600 disabled:opacity-50"
                        >
                          {imcFeedbackMutation.isPending ? <Spinner size={12} /> : null}
                          Submit Feedback Directly to Management
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Centralized Joint Investigation Report Card (Visible for general viewing when submitted) */}
            {latestInvReport && !canImcReviewInvestigator && (
              <div className="card p-5 border border-indigo-200 bg-white shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="text-emerald-600" size={20} />
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Joint Investigation Report</h2>
                      <p className="text-xs text-slate-500">
                        Submitted on behalf of the panel by <span className="font-semibold text-slate-700">{latestInvReport.full_name}</span>
                        {latestInvReport.created_at && <> • {formatDateTime(latestInvReport.created_at)}</>}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Report Submitted
                  </span>
                </div>

                {/* Appointed Panel Roster */}
                {incident.investigators?.length > 0 && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Appointed Investigation Panel:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {incident.investigators.map(inv => {
                        const isPrimary = Boolean(inv.role === 'imc' || inv.is_imc_member || inv.is_imc_lead);
                        return (
                          <div
                            key={inv.id || inv.investigator_id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs shadow-2xs"
                          >
                            <span className="font-semibold text-slate-800">{inv.full_name}</span>
                            {inv.employee_id && <span className="text-[10px] text-slate-400 font-mono">({inv.employee_id})</span>}
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                              isPrimary ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}>
                              {isPrimary ? 'Primary (IMC)' : 'Secondary'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Report Findings Text */}
                <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-1.5">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Investigation Findings & Analysis:
                  </p>
                  <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {latestInvReport.feedback_text}
                  </p>
                </div>

                {/* Evidence Attachments if any */}
                {investigationAttachmentsList?.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                      <Paperclip size={13} className="text-indigo-600" />
                      Attached Evidence & Documents ({investigationAttachmentsList.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {investigationAttachmentsList.map(att => (
                        <a
                          key={att.id}
                          href={`${UPLOADS_URL}/${att.stored_filename}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-700 transition-colors shadow-2xs"
                        >
                          <FileText size={13} className="text-indigo-600" />
                          <span className="truncate max-w-[200px]">{att.original_filename}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {incident.status === 'with_imc_review' && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-900 flex items-center gap-2">
                    <Clock size={15} className="text-purple-600 flex-shrink-0" />
                    <span>The joint investigation report is currently under review and satisfaction assessment by the IMC Convenor.</span>
                  </div>
                )}
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
              timelineEvents={data.timelineEvents}
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
        hodAttachments={hodAttachments}
        setHodAttachments={setHodAttachments}
        mutate={() => hodFeedbackMutation.mutate()}
        isPending={hodFeedbackMutation.isPending}
        canHodFeedback={canHodFeedback}
      />
      <ManagementDecisionModal
        show={showMdModal}
        onClose={() => setShowMdModal(false)}
        mdActions={mdActions}
        setMdActions={setMdActions}
        mdAttachments={mdAttachments}
        setMdAttachments={setMdAttachments}
        mdProposedOutcome={mdProposedOutcome}
        setMdProposedOutcome={setMdProposedOutcome}
        incidentProposedOutcome={incident?.proposed_outcome}
        mutate={(decision) => mdMutation.mutate(decision)}
        isPending={mdMutation.isPending}
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
      <InvolveDepartmentModal
        show={showInvolveDeptModal}
        onClose={() => setShowInvolveDeptModal(false)}
        currentDepartments={incident?.departments || []}
        departmentsList={departmentsList}
        mutate={(deptIds) => involveDepartmentsMutation.mutate(deptIds)}
        isPending={involveDepartmentsMutation.isPending}
      />
      <FilePreviewModal
        previewFile={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </>
  );
}
