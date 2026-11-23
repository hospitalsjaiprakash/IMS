import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { incidentsApi, metaApi, authApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { Pencil, CheckCircle2 } from 'lucide-react';
import { Alert, Breadcrumbs, SkeletonDetail } from '../../components/ui';
import { parseProposedOutcomes, INCIDENT_CATEGORIES, getApiErrorMessage } from '../../utils/helpers';

import IncidentHeader from '../../components/incident-detail/IncidentHeader';
import IncidentDetailsCard from '../../components/incident-detail/IncidentDetailsCard';
import { CaseStoryFeed, CaseStoryMiniMap } from '../../components/case-story';
import IncidentActions from '../../components/incident-detail/IncidentActions';
import { isImcUser } from '../../utils/helpers';
import LetterDraftingModal from '../../components/incident-detail/LetterDraftingModal';
import LettersCard from '../../components/incident-detail/LettersCard';
import TrainerAssignmentModal from '../../components/incident-detail/TrainerAssignmentModal';
import TrainerReportModal from '../../components/incident-detail/TrainerReportModal';
import TrainingProgressCard from '../../components/incident-detail/TrainingProgressCard';
import RedirectionReviewCard from '../../components/incident-detail/RedirectionReviewCard';
import ImcAssessmentForm from '../../components/incident-detail/ImcAssessmentForm';
import ClosureSummaryCard from '../../components/incident-detail/ClosureSummaryCard';

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
  InvolveDepartmentModal,
} from '../../components/incident-detail/modals';

export default function IncidentDetailPage() {
  const { id } = useParams();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showMdModal, setShowMdModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showRedirectModal, setShowRedirectModal] = useState(false);
  const [showRejectRedirectModal, setShowRejectRedirectModal] = useState(false);
  const [showImcReportModal, setShowImcReportModal] = useState(false);
  const [showInvolveDeptModal, setShowInvolveDeptModal] = useState(false);

  const [editFbModal, setEditFbModal] = useState(null);
  const [editFbText, setEditFbText] = useState('');

  const [showEditIncModal, setShowEditIncModal] = useState(false);
  const [editInc, setEditInc] = useState({});

  // Isolated form states per action (never shared across forms)
  const [withdrawReason, setWithdrawReason] = useState('');
  const [deptFeedbackText, setDeptFeedbackText] = useState('');
  const [imcFeedbackText, setImcFeedbackText] = useState('');
  const [reinvestigateRemarks, setReinvestigateRemarks] = useState('');
  const [imcSeverity, setImcSeverity] = useState('');
  const [imcProposedOutcome, setImcProposedOutcome] = useState('');
  const [mdActions, setMdActions] = useState('');
  const [mdResponsibleEmployees, setMdResponsibleEmployees] = useState([]);
  const [mdPenaltyAmount, setMdPenaltyAmount] = useState('');
  const [mdProposedOutcome, setMdProposedOutcome] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [redirectReason, setRedirectReason] = useState('');
  const [redirectTargetCategories, setRedirectTargetCategories] = useState([]);
  const [retainRequestingCategory, setRetainRequestingCategory] = useState(false);
  const [rejectRedirectReason, setRejectRedirectReason] = useState('');

  // Letter & Trainer workflow states
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [editingLetter, setEditingLetter] = useState(null);
  const [draftingEmployee, setDraftingEmployee] = useState(null);
  const [showAssignTrainerModal, setShowAssignTrainerModal] = useState(false);
  const [showTrainerReportModal, setShowTrainerReportModal] = useState(false);
  const [imcResponsibleEmployees, setImcResponsibleEmployees] = useState([]);

  const [hodAttachments, setHodAttachments] = useState([]);
  const [imcAttachments, setImcAttachments] = useState([]);
  const [mdAttachments, setMdAttachments] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);

  // Investigator states
  const [investigatorRequired, setInvestigatorRequired] = useState(false);
  const [primaryInvestigators, setPrimaryInvestigators] = useState([]);
  const [secondaryInvestigators, setSecondaryInvestigators] = useState([]);
  const [investigatorReportText, setInvestigatorReportText] = useState('');
  const [investigatorAttachments, setInvestigatorAttachments] = useState([]);
  const [satisfactionDecision, setSatisfactionDecision] = useState('satisfied');
  const [reassignMode, setReassignMode] = useState(false);
  const [reassignPrimary, setReassignPrimary] = useState([]);
  const [reassignSecondary, setReassignSecondary] = useState([]);

  const handleImcResponsibleEmployeesChange = (newEmps) => {
    setImcResponsibleEmployees(newEmps);
    if (newEmps && newEmps.length > 0) {
      const allOutcomes = new Set();
      const currentList = parseProposedOutcomes(imcProposedOutcome);
      currentList.forEach(o => {
        if (['No Action', 'New Protocol and Process Flow', 'Modifying Protocol and Process Flow', 'Inappropriate Complaint', 'Others'].includes(o)) {
          allOutcomes.add(o);
        }
      });
      newEmps.forEach(emp => {
        (emp.outcomes || []).forEach(o => allOutcomes.add(o));
      });
      if (allOutcomes.size > 0) {
        setImcProposedOutcome(Array.from(allOutcomes).join(', '));
      }
    }
  };

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
        setShowInvolveDeptModal(false);
        setEditFbModal(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['incident', String(id)],
    queryFn: () => incidentsApi.get(id).then(r => r.data),
    refetchInterval: (query) => {
      const incStatus = query?.state?.data?.incident?.status || query?.state?.data?.status;
      return ['closed', 'resolved', 'withdrawn'].includes(incStatus) ? false : 8000;
    },
    refetchOnWindowFocus: true,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['incident-categories'],
    queryFn: () => metaApi.categories().then(r => r.data || []),
  });

  const categoryOptions = useMemo(() => {
    if (Array.isArray(categoriesData) && categoriesData.length > 0) {
      return categoriesData.filter(c => c.is_active !== false).map(c => c.name);
    }
    return INCIDENT_CATEGORIES;
  }, [categoriesData]);

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ['incident', String(id)] });
    qc.invalidateQueries({ queryKey: ['incidents'] });
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const withdrawMutation = useMutation({
    mutationFn: () => incidentsApi.withdraw(id, { reason: withdrawReason }),
    onSuccess: () => {
      toast.success('Incident withdrawn.');
      setShowWithdrawModal(false);
      setWithdrawReason('');
      refetch();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to withdraw incident.')),
  });

  const hodFeedbackMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('feedbackText', deptFeedbackText);
      hodAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.hodFeedback(id, fd);
    },
    onSuccess: () => {
      toast.success('Feedback submitted.');
      setShowFeedbackModal(false);
      setHodAttachments([]);
      setDeptFeedbackText('');
      refetch();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to submit feedback.')),
  });

  const imcFeedbackMutation = useMutation({
    mutationFn: (forwardToMd) => {
      const fd = new FormData();
      fd.append('feedbackText', imcFeedbackText);
      fd.append('forwardToMd', !!forwardToMd);
      fd.append('severity', imcSeverity);
      if (imcProposedOutcome) fd.append('proposedOutcome', imcProposedOutcome);
      if (imcResponsibleEmployees.length > 0) {
        fd.append('responsibleEmployees', JSON.stringify(imcResponsibleEmployees));
      }
      imcAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.imcFeedback(id, fd);
    },
    onSuccess: () => {
      toast.success('IMC assessment submitted.');
      setImcAttachments([]);
      setImcFeedbackText('');
      setImcSeverity('');
      setImcProposedOutcome('');
      setImcResponsibleEmployees([]);
      refetch();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to submit IMC assessment.')),
  });

  const mdMutation = useMutation({
    mutationFn: (decisionType) => {
      const fd = new FormData();
      fd.append('decision', decisionType);
      if (mdActions) {
        fd.append('notes', mdActions);
        fd.append('correctiveActions', mdActions);
      }
      if (decisionType === 'DISAGREE_MODIFY' && mdProposedOutcome) {
        fd.append('proposedOutcome', mdProposedOutcome);
      }
      if (mdResponsibleEmployees) {
        fd.append('responsibleEmployees', JSON.stringify(mdResponsibleEmployees));
      }
      if (mdPenaltyAmount) fd.append('penaltyAmount', mdPenaltyAmount);
      mdAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.managementAction(id, fd);
    },
    onSuccess: () => {
      toast.success('Management action submitted.');
      setShowMdModal(false);
      setMdAttachments([]);
      setMdActions('');
      setMdProposedOutcome('');
      setMdPenaltyAmount('');
      setMdResponsibleEmployees([]);
      refetch();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to submit management action.')),
  });

  const imcReportMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      imcAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.imcReport(id, fd);
    },
    onSuccess: () => {
      toast.success('Official IMC Report generated.');
      setShowImcReportModal(false);
      setImcAttachments([]);
      refetch();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to generate IMC report.')),
  });

  const closeIncidentMutation = useMutation({
    mutationFn: () => incidentsApi.closeIncident(id),
    onSuccess: () => {
      toast.success('Incident closed.');
      refetch();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to close incident.')),
  });

  const reopenMutation = useMutation({
    mutationFn: () => incidentsApi.reopen(id, { reason: reopenReason }),
    onSuccess: () => {
      toast.success('Incident reopened.');
      setShowReopenModal(false);
      setReopenReason('');
      refetch();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to reopen incident.')),
  });

  const escalateMutation = useMutation({
    mutationFn: () => incidentsApi.escalatePriority(id),
    onSuccess: () => {
      toast.success('Priority escalated!');
      refetch();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to escalate priority.')),
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
    onError: (e) => toast.error(getApiErrorMessage(e, 'Failed to assign investigators.')),
  });

  const investigatorReportMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('reportText', investigatorReportText);
      investigatorAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.investigatorReport(id, fd);
    },
    onSuccess: () => {
      toast.success('Investigation Report submitted.');
      setInvestigatorReportText('');
      setInvestigatorAttachments([]);
      refetch();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Failed to submit report.')),
  });

  const rejectInvestigatorReportMutation = useMutation({
    mutationFn: (payload) => incidentsApi.rejectInvestigatorReport(id, payload),
    onSuccess: () => {
      toast.success('Reinvestigation requested successfully.');
      setReinvestigateRemarks('');
      setReassignPrimary([]);
      setReassignSecondary([]);
      setReassignMode(false);
      refetch();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Failed to submit reinvestigation request.')),
  });

  const isConvenor = Boolean(user?.is_imc_lead || user?.isImcLead || user?.is_system_admin || user?.role === 'system_admin');
  const { data: imcMembers = [] } = useQuery({
    queryKey: ['imcMembers'],
    queryFn: () =>
      authApi.getCommitteeMembers().then(res => {
        const list = Array.isArray(res.data) ? res.data : (res.data?.members || []);
        return list.filter(isImcUser);
      }),
    enabled: isConvenor,
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
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to update feedback.')),
  });

  const editIncidentMutation = useMutation({
    mutationFn: (payload) => incidentsApi.updateIncident(id, payload),
    onSuccess: () => {
      toast.success('Incident updated.');
      setShowEditIncModal(false);
      refetch();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to update incident.')),
  });

  const requestRedirectMutation = useMutation({
    mutationFn: () => incidentsApi.requestRedirect(id, { reason: redirectReason }),
    onSuccess: () => {
      toast.success('Redirection request submitted.');
      setShowRedirectModal(false);
      setRedirectReason('');
      refetch();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to request redirection.')),
  });

  const approveRedirectMutation = useMutation({
    mutationFn: () =>
      incidentsApi.approveRedirect(id, {
        targetCategories: redirectTargetCategories,
        actionType: retainRequestingCategory ? 'partial' : 'full',
      }),
    onSuccess: () => {
      toast.success('Incident successfully redirected.');
      setRedirectTargetCategories([]);
      setRetainRequestingCategory(false);
      refetch();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Failed to redirect incident.')),
  });

  const involveDepartmentsMutation = useMutation({
    mutationFn: (categories) => incidentsApi.involveDepartments(id, { categories }),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Additional category involvement added.');
      setShowInvolveDeptModal(false);
      refetch();
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Failed to involve categories.')),
  });

  const rejectRedirectMutation = useMutation({
    mutationFn: () => incidentsApi.rejectRedirect(id, { reason: rejectRedirectReason }),
    onSuccess: () => {
      toast.success('Redirection request rejected.');
      setShowRejectRedirectModal(false);
      setRejectRedirectReason('');
      refetch();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to reject redirection.')),
  });

  const openEditFeedback = (feedbackType, currentText, feedbackId) => {
    setEditFbModal({ feedbackType, feedbackId });
    setEditFbText(currentText || '');
  };

  const openEditIncident = (inc) => {
    setEditInc({
      description: inc.description || '',
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
  }, [data?.incident?.status, data?.incident?.latest_investigation_report?.feedback_text, investigatorReportText]);

  if (isLoading) return <SkeletonDetail />;
  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Alert type="error" title="Unable to Load Incident" message={getApiErrorMessage(error, 'Incident not found or access denied.')} />
      </div>
    );
  }

  const { incident, feedbacks = [], attachments = [], finalReport } = data;

  const latestInvReport =
    incident.latest_investigation_report || feedbacks.filter(f => f.role === 'investigator').pop() || null;
  const investigationAttachmentsList =
    incident.investigation_attachments?.length > 0
      ? incident.investigation_attachments
      : attachments.filter(a => a.stage === 'investigator_report');

  const hasImcFeedback = feedbacks.some(f => f.role === 'imc');
  const canWithdraw = user?.id === incident.reporter_id && ['submitted', 'with_hod'].includes(incident.status);

  // Reviewers can be ANY active staff mapped to an incident category (TC-02), regardless of primary role
  const isTargetReviewer = Boolean(incident.is_target_reviewer || incident.is_target_hod);
  const isPendingRedirectRequester = Boolean(
    incident.status === 'redirect_requested' &&
    incident.redirect_requested_by_user_id &&
    incident.redirect_requested_by_user_id === user?.id
  );
  const isReporterAllowed = !incident.redirect_rejected_at ? user?.id !== incident.reporter_id : true;

  const canHodFeedback =
    isTargetReviewer &&
    !isPendingRedirectRequester &&
    isReporterAllowed &&
    ['submitted', 'with_hod', 'with_hod_and_imc', 'redirect_requested'].includes(incident.status) &&
    !incident.user_hod_dept_submitted &&
    !hasImcFeedback;

  const canRequestRedirect =
    isTargetReviewer &&
    user?.id !== incident.reporter_id &&
    !incident.redirect_rejected_at &&
    ['submitted', 'with_hod', 'with_hod_and_imc'].includes(incident.status) &&
    !incident.user_hod_dept_submitted &&
    !hasImcFeedback;

  const isLead = Boolean(user?.is_imc_lead || user?.isImcLead || user?.is_system_admin || user?.role === 'system_admin');
  const isImcLeadOnly = Boolean(user?.role === 'imc' && (user?.is_imc_lead || user?.isImcLead));
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

  const isManagement = Boolean(
    user?.role === 'head_management' ||
    user?.is_management_member ||
    user?.isManagementMember ||
    user?.role === 'system_admin' ||
    user?.is_system_admin ||
    user?.isSystemAdmin
  );
  const hasVerifiedTraining =
    Array.isArray(data?.trainers) &&
    data.trainers.some(t => ['verified', 'verified_by_imc', 'closed'].includes(t.status));
  const canMdAct =
    isManagement &&
    user?.id !== incident.reporter_id &&
    incident.status === 'with_head_management' &&
    !hasVerifiedTraining &&
    !incident.management_decision;
  const canReopen = (isManagement || isImcMember) && user?.id !== incident.reporter_id && ['resolved', 'closed'].includes(incident.status);

  // TC-04: Escalation restricted exclusively to IMC Lead / Convenor
  const canEscalate =
    isImcLeadOnly &&
    user?.id !== incident.reporter_id &&
    !['resolved', 'closed', 'withdrawn'].includes(incident.status) &&
    !incident.priority_escalated_by;

  const myInvestigationAssignment = incident.investigators?.find(i => i.investigator_id === user?.id);
  const isAssignedInvestigator = Boolean(myInvestigationAssignment);
  const isAssignedPrimary = Boolean(
    isAssignedInvestigator &&
      (myInvestigationAssignment.role === 'imc' ||
        myInvestigationAssignment.is_imc_member ||
        myInvestigationAssignment.is_imc_lead ||
        isImcMember)
  );
  const isAssignedSecondary = Boolean(isAssignedInvestigator && !isAssignedPrimary && !isImcMember);
  const hasInvestigatorsAssigned = Boolean(incident.investigators && incident.investigators.length > 0);
  const allInvestigatorsCompleted = Boolean(
    incident.all_investigators_submitted ||
      (hasInvestigatorsAssigned && incident.investigators.every(i => i.status === 'completed'))
  );
  const canInvestigatorAct = incident.status === 'with_investigator' && (isAssignedPrimary || isImcMember);
  const canImcReviewInvestigator =
    isLead &&
    (incident.status === 'with_imc_review' ||
      (incident.status === 'with_investigator' && hasInvestigatorsAssigned && allInvestigatorsCompleted));
  const canGenerateImcReport =
    ['imc', 'system_admin'].includes(user?.role) && isLead && incident.status === 'pending_imc_report';
  const canCloseIncident = isLead && incident.status === 'pending_training';

  const isFeedbackLocked = (fb) => {
    if (['resolved', 'closed', 'withdrawn'].includes(incident?.status)) return true;
    if (fb.role === 'hod' || fb.role === 'investigator') {
      return feedbacks.some(f => ['imc', 'head_management'].includes(f.role) && new Date(f.created_at) >= new Date(fb.created_at));
    }
    if (fb.role === 'imc') {
      return feedbacks.some(f => f.role === 'head_management' && new Date(f.created_at) >= new Date(fb.created_at));
    }
    if (fb.role === 'head_management') {
      return ['pending_training', 'resolved', 'closed'].includes(incident?.status);
    }
    return false;
  };

  const myEditableFeedbacks = feedbacks.filter(fb => fb.author_id === user?.id && !isFeedbackLocked(fb));

  const currentIncidentCategories =
    Array.isArray(incident.categories) && incident.categories.length > 0
      ? incident.categories
      : (Array.isArray(incident.incident_categories) && incident.incident_categories.length > 0
          ? incident.incident_categories
          : (incident.incident_category ? [incident.incident_category] : []));

  return (
    <>
      <div className="mb-3 print:hidden">
        <Breadcrumbs
          items={[{ label: 'Incidents', to: '/incidents' }, { label: incident?.reference_id || 'Detail' }]}
          className="mb-0"
        />
      </div>

      <IncidentHeader
        incident={incident}
        user={user}
        actions={
          <IncidentActions
            incident={incident}
            user={user}
            canWithdraw={canWithdraw}
            canHodFeedback={canHodFeedback}
            canRequestRedirect={canRequestRedirect}
            canMdAct={canMdAct}
            canReopen={canReopen}
            canEscalate={canEscalate}
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
            closeIncidentMutation={closeIncidentMutation}
          />
        }
      />

      {/* Main Layout */}
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

            {/* Editable Author Feedback Bar */}
            {myEditableFeedbacks.length > 0 && (
              <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-indigo-950">
                  <strong className="font-bold">Your Submitted Feedback:</strong> You can update your feedback until the next review stage begins.
                </div>
                <div className="flex flex-wrap gap-2">
                  {myEditableFeedbacks.map(fb => (
                    <button
                      key={fb.id}
                      type="button"
                      onClick={() => openEditFeedback(fb.role, fb.feedback_text, fb.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
                    >
                      <Pencil size={12} />
                      Edit {fb.role === 'hod' ? 'Department' : fb.role === 'imc' ? 'IMC' : 'Submitted'} Feedback
                    </button>
                  ))}
                </div>
              </div>
            )}

            <CaseStoryFeed
              events={data?.events || []}
              incident={incident}
              onViewAttachment={(att) => setPreviewFile(att)}
            />

            {/* Active Workflow / Next Action Area */}
            <div id="next-action-area" className="space-y-5 pt-2">
              {incident.status === 'redirect_requested' && canImcAct && (
                <RedirectionReviewCard
                  incident={incident}
                  categoryOptions={categoryOptions}
                  targetCategories={redirectTargetCategories}
                  setTargetCategories={setRedirectTargetCategories}
                  retainRequestingCategory={retainRequestingCategory}
                  setRetainRequestingCategory={setRetainRequestingCategory}
                  onApprove={() => approveRedirectMutation.mutate()}
                  onOpenRejectModal={() => setShowRejectRedirectModal(true)}
                  isApproving={approveRedirectMutation.isPending}
                />
              )}

              <ImcAssessmentForm
                incident={incident}
                isLead={isLead}
                isImcMember={isImcMember}
                canImcAct={canImcAct}
                hasInvestigatorsAssigned={hasInvestigatorsAssigned}
                isAssignedPrimary={isAssignedPrimary}
                isAssignedSecondary={isAssignedSecondary}
                canInvestigatorAct={canInvestigatorAct}
                canImcReviewInvestigator={canImcReviewInvestigator}
                latestInvReport={latestInvReport}
                investigationAttachmentsList={investigationAttachmentsList}
                onViewAttachment={(att) => setPreviewFile(att)}
                imcMembers={imcMembers}
                investigatorRequired={investigatorRequired}
                setInvestigatorRequired={setInvestigatorRequired}
                primaryInvestigators={primaryInvestigators}
                setPrimaryInvestigators={setPrimaryInvestigators}
                secondaryInvestigators={secondaryInvestigators}
                setSecondaryInvestigators={setSecondaryInvestigators}
                assignInvestigatorMutation={assignInvestigatorMutation}
                investigatorReportText={investigatorReportText}
                setInvestigatorReportText={setInvestigatorReportText}
                investigatorAttachments={investigatorAttachments}
                setInvestigatorAttachments={setInvestigatorAttachments}
                investigatorReportMutation={investigatorReportMutation}
                satisfactionDecision={satisfactionDecision}
                setSatisfactionDecision={setSatisfactionDecision}
                reinvestigateRemarks={reinvestigateRemarks}
                setReinvestigateRemarks={setReinvestigateRemarks}
                reassignMode={reassignMode}
                setReassignMode={setReassignMode}
                reassignPrimary={reassignPrimary}
                setReassignPrimary={setReassignPrimary}
                reassignSecondary={reassignSecondary}
                setReassignSecondary={setReassignSecondary}
                rejectInvestigatorReportMutation={rejectInvestigatorReportMutation}
                imcFeedbackText={imcFeedbackText}
                setImcFeedbackText={setImcFeedbackText}
                imcAttachments={imcAttachments}
                setImcAttachments={setImcAttachments}
                imcSeverity={imcSeverity}
                setImcSeverity={setImcSeverity}
                imcProposedOutcome={imcProposedOutcome}
                setImcProposedOutcome={setImcProposedOutcome}
                imcResponsibleEmployees={imcResponsibleEmployees}
                setImcResponsibleEmployees={setImcResponsibleEmployees}
                onResponsibleEmployeesChange={handleImcResponsibleEmployeesChange}
                imcFeedbackMutation={imcFeedbackMutation}
              />

              {/* Post-Training Closure Review */}
              {incident.status === 'with_head_management' && hasVerifiedTraining && (
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300 rounded-xl p-4 shadow-sm flex items-center justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <p className="font-bold text-emerald-950 text-sm flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600" /> Awaiting Final Management Sign-off &amp; Incident Closure
                    </p>
                    <p className="text-xs text-emerald-800">
                      Corrective training has been delivered and verified by the IMC. Executive Management final review and official case closure is required.
                    </p>
                  </div>
                  {isManagement && (
                    <button
                      type="button"
                      onClick={() => document.getElementById('step7-training-card')?.scrollIntoView({ behavior: 'smooth' })}
                      className="btn-primary btn-sm text-xs bg-emerald-700 hover:bg-emerald-800 border-emerald-700 shadow-sm flex items-center gap-1.5 font-semibold"
                    >
                      Review Training &amp; Close Incident ↓
                    </button>
                  )}
                </div>
              )}

              <LettersCard
                incident={incident}
                letters={data?.letters || []}
                responsibleEmployees={incident?.responsible_employees || []}
                user={user}
                isManagement={isManagement}
                onOpenDraftModal={() => {
                  setEditingLetter(null);
                  setDraftingEmployee(null);
                  setShowDraftModal(true);
                }}
                onDraftForEmployee={(emp) => {
                  setEditingLetter(null);
                  setDraftingEmployee(emp);
                  setShowDraftModal(true);
                }}
                onEditDraft={(letter) => {
                  setEditingLetter(letter);
                  setDraftingEmployee(null);
                  setShowDraftModal(true);
                }}
                onRefetch={refetch}
              />

              <TrainingProgressCard
                incident={incident}
                trainers={data?.trainers || []}
                user={user}
                isManagement={isManagement}
                onOpenAssignModal={() => setShowAssignTrainerModal(true)}
                onOpenReportModal={() => setShowTrainerReportModal(true)}
                onRefetch={refetch}
              />

              <ClosureSummaryCard
                incident={incident}
                finalReport={finalReport}
                isManagement={isManagement}
                canImcAct={canImcAct}
                onOpenReopenModal={() => setShowReopenModal(true)}
              />
            </div>
          </div>

          <div className="space-y-5">
            <CaseStoryMiniMap incident={incident} events={data?.events || []} />
          </div>
        </div>
      </div>

      {/* Modals */}
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
        feedbackText={deptFeedbackText}
        setFeedbackText={setDeptFeedbackText}
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
        responsibleEmployees={incident?.responsible_employees || []}
        mdResponsibleEmployees={mdResponsibleEmployees}
        setMdResponsibleEmployees={setMdResponsibleEmployees}
        penaltyAmount={mdPenaltyAmount}
        setPenaltyAmount={setMdPenaltyAmount}
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
        mutate={(payload) => editFeedbackMutation.mutate(payload)}
        isPending={editFeedbackMutation.isPending}
      />
      <EditIncidentModal
        show={showEditIncModal}
        onClose={() => setShowEditIncModal(false)}
        editInc={editInc}
        setEditInc={setEditInc}
        mutate={(payload) => editIncidentMutation.mutate(payload)}
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
        currentCategories={currentIncidentCategories}
        categoryOptions={categoryOptions}
        mutate={(categories) => involveDepartmentsMutation.mutate(categories)}
        isPending={involveDepartmentsMutation.isPending}
      />
      <FilePreviewModal
        previewFile={previewFile}
        onClose={() => setPreviewFile(null)}
      />

      <LetterDraftingModal
        show={showDraftModal}
        onClose={() => {
          setShowDraftModal(false);
          setEditingLetter(null);
          setDraftingEmployee(null);
        }}
        incident={incident}
        responsibleEmployees={incident?.responsible_employees || []}
        initialEmployee={draftingEmployee}
        existingLetter={editingLetter}
        existingLetters={data?.letters || incident?.letters || []}
        onSaveSuccess={refetch}
      />

      <TrainerAssignmentModal
        show={showAssignTrainerModal}
        onClose={() => setShowAssignTrainerModal(false)}
        incident={incident}
        responsibleEmployees={incident?.responsible_employees || []}
        onSuccess={refetch}
      />

      <TrainerReportModal
        show={showTrainerReportModal}
        onClose={() => setShowTrainerReportModal(false)}
        incident={incident}
        trainerAssignment={(data?.trainers || [])[data?.trainers?.length - 1]}
        onSuccess={refetch}
      />
    </>
  );
}
