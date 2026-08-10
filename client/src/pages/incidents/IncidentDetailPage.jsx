import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { incidentsApi, metaApi, UPLOADS_URL } from '../../api';
import { useAuthStore } from '../../store/authStore';
import {
  getSeverityClass, getStatusLabel, getStatusClass,
  formatDate, formatDateTime
} from '../../utils/helpers';
import { OCCURRED_TO_OPTIONS, SEVERITY_OPTIONS } from '../../utils/helpers';
import { Alert, Modal, Spinner, Breadcrumbs, StatusBadge, SeverityBadge, SLABadge, SkeletonDetail } from '../../components/ui';
import {
  ArrowLeft, MapPin, Calendar, User, FileText, CheckCircle,
  Clock, XCircle, AlertTriangle, MessageSquare, UserCheck,
  Undo2, Users, Building, Pencil, AlertCircle, Flame, Bell,
  Upload, X, Paperclip, Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import logo from '../../assets/logo.webp';

const TIMELINE_STAGES = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'with_hod', label: 'Awaiting HOD Feedback' },
  { key: 'with_imc', label: 'HOD Reviewed - Awaiting IMC' },
  { key: 'with_head_management', label: 'IMC Reviewed - Awaiting Mgmt' },
  { key: 'resolved', label: 'Resolved' },
];

const statusOrder = {
  submitted: 0, with_hod: 1, with_hod_and_imc: 1, with_imc: 2,
  redirect_requested: 2, with_head_management: 3, pending_training: 3.5, resolved: 4,
};

const FileUploadArea = ({ files, setFiles }) => (
  <div className="mt-4">
    <label className="field-label">Attachments (Optional)</label>
    {files.length > 0 && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {files.map((file, idx) => (
          <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Paperclip size={14} className="text-slate-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFiles(files.filter((_, i) => i !== idx))}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    )}
    <div className="relative">
      <input
        type="file"
        multiple
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={(e) => {
          if (e.target.files?.length) {
            setFiles([...files, ...Array.from(e.target.files)]);
          }
          e.target.value = null;
        }}
      />
      <div className="flex flex-col items-center justify-center py-4 px-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 transition-colors">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mb-1">
          <Upload size={14} className="text-blue-600" />
        </div>
        <p className="text-sm font-medium text-slate-700">Click or drag files here</p>
      </div>
    </div>
  </div>
);

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

  // Edit own feedback modal (HOD / IMC / Management)
  const [editFbModal, setEditFbModal] = useState(null); // { feedbackType, currentText }
  const [editFbText, setEditFbText] = useState('');

  // Edit incident modal (Employee only, while still 'submitted')
  const [showEditIncModal, setShowEditIncModal] = useState(false);
  const [editInc, setEditInc] = useState({});

  const [withdrawReason, setWithdrawReason] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [mdFaultType, setMdFaultType] = useState('');
  const [mdActions, setMdActions] = useState('');
  const [mdRequireTraining, setMdRequireTraining] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [hodAcknowledged, setHodAcknowledged] = useState(false);
  const [redirectReason, setRedirectReason] = useState('');
  const [redirectTargetDept, setRedirectTargetDept] = useState('');
  const [showRejectRedirectModal, setShowRejectRedirectModal] = useState(false);
  const [rejectRedirectReason, setRejectRedirectReason] = useState('');

  // Attachment states for feedback
  const [hodAttachments, setHodAttachments] = useState([]);
  const [imcAttachments, setImcAttachments] = useState([]);
  const [mdAttachments, setMdAttachments] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setShowWithdrawModal(false);
        setShowFeedbackModal(false);
        setShowMdModal(false);
        setShowReopenModal(false);
        setShowRedirectModal(false);
        setShowRejectRedirectModal(false);
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
    onMutate: async () => {
      await qc.cancelQueries(['incident', id]);
      const prev = qc.getQueryData(['incident', id]);
      if (prev) {
        qc.setQueryData(['incident', id], { ...prev, incident: { ...prev.incident, status: 'withdrawn' } });
      }
      return { prev };
    },
    onError: (err, vars, context) => {
      if (context?.prev) qc.setQueryData(['incident', id], context.prev);
      toast.error('Failed to withdraw');
    },
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
    onMutate: async () => {
      await qc.cancelQueries(['incident', id]);
      const prev = qc.getQueryData(['incident', id]);
      if (prev) {
        qc.setQueryData(['incident', id], { ...prev, incident: { ...prev.incident, status: 'with_imc' } });
      }
      return { prev };
    },
    onError: (err, vars, context) => {
      if (context?.prev) qc.setQueryData(['incident', id], context.prev);
      toast.error('Failed to submit feedback');
    },
    onSuccess: () => { toast.success('Feedback submitted.'); setShowFeedbackModal(false); setHodAttachments([]); setFeedbackText(''); refetch(); }
  });

  const imcFeedbackMutation = useMutation({
    mutationFn: (forwardToMd) => {
      const fd = new FormData();
      fd.append('feedbackText', feedbackText);
      fd.append('forwardToMd', !!forwardToMd);
      imcAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.imcFeedback(id, fd);
    },
    onMutate: async (forwardToMd) => {
      await qc.cancelQueries(['incident', id]);
      const prev = qc.getQueryData(['incident', id]);
      if (prev) {
        qc.setQueryData(['incident', id], { 
          ...prev, 
          incident: { ...prev.incident, status: forwardToMd ? 'with_head_management' : 'resolved' } 
        });
      }
      return { prev };
    },
    onError: (err, vars, context) => {
      if (context?.prev) qc.setQueryData(['incident', id], context.prev);
      toast.error('Failed to submit feedback');
    },
    onSuccess: () => { toast.success('Feedback submitted.'); setShowFeedbackModal(false); setImcAttachments([]); setFeedbackText(''); refetch(); }
  });

  const mdMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('faultType', mdFaultType);
      fd.append('correctiveActions', mdActions);
      fd.append('requireTraining', mdRequireTraining);
      mdAttachments.forEach(f => fd.append('attachments', f));
      return incidentsApi.mdDecision(id, fd);
    },
    onMutate: async () => {
      await qc.cancelQueries(['incident', id]);
      const prev = qc.getQueryData(['incident', id]);
      if (prev) {
        qc.setQueryData(['incident', id], { 
          ...prev, 
          incident: { ...prev.incident, status: mdRequireTraining ? 'pending_training' : 'resolved' } 
        });
      }
      return { prev };
    },
    onError: (err, vars, context) => {
      if (context?.prev) qc.setQueryData(['incident', id], context.prev);
      toast.error('Failed to submit decision');
    },
    onSuccess: () => { toast.success('Incident closed.'); setShowMdModal(false); setMdAttachments([]); setMdFaultType(''); setMdActions(''); refetch(); }
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
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Reminder notification & mail sent to HOD!');
      refetch();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to send reminder to HOD')
  });

  // Edit own feedback (role-based)
  const editFeedbackMutation = useMutation({
    mutationFn: ({ feedbackType, feedbackText: ft }) =>
      incidentsApi.editFeedback(id, { feedbackType, feedbackText: ft }),
    onSuccess: () => {
      toast.success('Feedback updated.');
      setEditFbModal(null);
      setEditFbText('');
      refetch();
      qc.invalidateQueries({ queryKey: ['all-incidents-analytics'] });
    },
    onError: () => toast.error('Failed to update feedback.'),
  });

  // Edit incident (employee reporter only, while still 'submitted')
  const editIncidentMutation = useMutation({
    mutationFn: (data) => incidentsApi.updateIncident(id, data),
    onSuccess: () => {
      toast.success('Incident updated.');
      setShowEditIncModal(false);
      refetch();
    },
    onError: () => toast.error('Failed to update incident.'),
  });

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

  const requestRedirectMutation = useMutation({
    mutationFn: () => incidentsApi.requestRedirect(id, { reason: redirectReason }),
    onSuccess: () => {
      toast.success('Redirection request submitted to IMC.');
      setShowRedirectModal(false);
      refetch();
    }
  });

  const approveRedirectMutation = useMutation({
    mutationFn: () => incidentsApi.approveRedirect(id, { targetDepartment: redirectTargetDept }),
    onSuccess: () => {
      toast.success('Incident successfully redirected.');
      setRedirectTargetDept('');
      refetch();
    }
  });

  const rejectRedirectMutation = useMutation({
    mutationFn: () => incidentsApi.rejectRedirect(id, { reason: rejectRedirectReason }),
    onSuccess: () => {
      toast.success('Redirection request rejected.');
      setShowRejectRedirectModal(false);
      refetch();
    }
  });

  const verifyTrainingMutation = useMutation({
    mutationFn: () => incidentsApi.verifyTraining(id),
    onSuccess: () => {
      toast.success('Training completion verified.');
      refetch();
    }
  });

  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => metaApi.departments().then(r => r.data || []),
  });
  const departmentsList = deptsData || [];

  if (isLoading) return <SkeletonDetail />;
  if (error || !data) return <Alert type="error" title="Not found" message="Incident not found or access denied." />;

  const { incident, feedbacks, attachments, finalReport } = data;

  const canWithdraw = user?.id === incident.reporter_id &&
    ['submitted', 'with_hod'].includes(incident.status);

  const canHodFeedback = user?.role === 'hod' &&
    ['with_hod', 'with_hod_and_imc'].includes(incident.status);

  const canRequestRedirect = user?.role === 'hod' &&
    ['with_hod', 'with_hod_and_imc'].includes(incident.status);

  const canImcAct = user?.role === 'imc' &&
    (['with_imc', 'with_hod_and_imc', 'redirect_requested', 'pending_training'].includes(incident.status) ||
     (incident.status === 'resolved' && incident.has_responsible_person && !incident.training_completed));

  const canMdAct = user?.role === 'head_management' &&
    incident.status === 'with_head_management';

  const canReopen = (user?.role === 'head_management' || user?.role === 'imc') &&
    incident.status === 'resolved';

  const canEscalate = (user?.role === 'head_management' || user?.role === 'imc') &&
    incident.status !== 'resolved' && incident.status !== 'withdrawn' && !incident.priority_escalated_by;

  const canRemindHod = (user?.role === 'head_management' || user?.role === 'imc') &&
    incident.status !== 'resolved' && incident.status !== 'withdrawn' &&
    !feedbacks?.some(fb => fb.role === 'hod');

  return (
    <>
      <div className="mb-2 print:hidden">
        <Breadcrumbs items={[
          { label: 'Incidents', to: '/incidents' },
          { label: incident?.reference_id || 'Detail' }
        ]} />
      </div>
      {/* --- PRINT TEMPLATE --- */}
      <div className="hidden print:block p-8 bg-white text-black w-full max-w-none m-0">
        {/* Header */}
        <div className="flex items-center gap-6 border-b-2 border-slate-800 pb-6 mb-6">
          <img src={logo} alt="JPHRC Logo" className="w-24 h-24 object-contain" />
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wide">Jaiprakash Hospital & Research Centre Pvt. Ltd.</h1>
            <p className="text-sm font-semibold text-slate-600 mt-1 uppercase tracking-widest">Incident Management System - Official Report</p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 text-sm leading-relaxed">
          <div className="flex justify-between items-start">
            <p><strong>Incident Reference ID:</strong> {incident.reference_id}</p>
            <p><strong>Generated On:</strong> {formatDate(new Date())}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 mt-4">
            <p><strong>Status:</strong> {getStatusLabel(incident.status)}</p>
            <p><strong>Severity:</strong> {incident.severity}</p>
            <p><strong>Incident Date & Time:</strong> {formatDate(incident.incident_date)} at {incident.incident_time?.slice(0,5)}</p>
            <p><strong>Location:</strong> {incident.main_location_name} - {incident.sub_location_name}</p>
            <p><strong>Reported By:</strong> {incident.reporter_name}</p>
            <p><strong>Occurred To:</strong> {incident.occurred_to}</p>
            <p className="col-span-2"><strong>Department(s) Involved:</strong> {(incident.departments||[]).map(d => typeof d === 'string' ? d : d.name).join(', ') || 'N/A'}</p>
            <p><strong>Incident Category:</strong> {incident.incident_category}</p>
            <p><strong>Incident Type:</strong> {incident.incident_type}</p>
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-200">
            <p className="font-bold text-base mb-2 uppercase tracking-wide">Description of the Incident</p>
            <p className="whitespace-pre-wrap">{incident.description}</p>
          </div>
          
          {incident.has_responsible_person && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <p className="font-bold text-base mb-2 uppercase tracking-wide">Responsible Personnel Details</p>
              <p><strong>Responsible Person:</strong> {incident.responsible_person_name}</p>
              {incident.training_completed ? (
                <p><strong>Mandatory Training Completed:</strong> Yes</p>
              ) : incident.status === 'pending_training' ? (
                <p><strong>Mandatory Training Completed:</strong> No (Pending)</p>
              ) : null}
            </div>
          )}

          {finalReport && (
            <div className="mt-6 pt-4 border-t border-slate-200 bg-slate-50 p-4 border border-slate-300">
              <p className="font-bold text-base mb-2 uppercase tracking-wide">Management Final Report</p>
              <p className="mb-2"><strong>Fault Type:</strong> {finalReport.fault_type}</p>
              <p><strong>Corrective Actions:</strong></p>
              <p className="whitespace-pre-wrap mb-2">{finalReport.corrective_actions}</p>
              <p className="text-xs text-slate-500">Generated At: {formatDateTime(finalReport.generated_at)}</p>
            </div>
          )}
          
          {feedbacks?.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <p className="font-bold text-base mb-4 uppercase tracking-wide">Review & Feedback History</p>
              <div className="space-y-4">
                {feedbacks.map(fb => (
                  <div key={fb.id} className="pb-4 border-b border-slate-100 last:border-0">
                    <p className="mb-1">
                      <strong>{fb.role?.replace('_', ' ').toUpperCase()} Review</strong> by {fb.full_name} ({fb.designation}) on {formatDateTime(fb.created_at)}
                    </p>
                    <p className="italic">"{fb.feedback_text}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="mt-16 pt-8 flex justify-between items-end border-t-2 border-slate-800 text-xs text-slate-500">
          <p>Confidential Document. For internal use only.</p>
          <div className="text-center">
            <div className="w-40 border-b border-slate-400 mb-1"></div>
            <p>Authorized Signature</p>
          </div>
        </div>
      </div>

      {/* --- NORMAL UI --- */}
      <div className="w-full space-y-5 print:hidden">
        {/* Back */}
      <button onClick={() => navigate('/incidents')} className="btn-ghost text-slate-500 -ml-1 print:hidden">
        <ArrowLeft size={16} />
        Back to Incidents
      </button>

      {/* Header card */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-base font-bold text-green-700">{incident.reference_id}</span>
              <StatusBadge status={incident.status} />
              <SLABadge createdAt={incident.created_at} status={incident.status} />
              {incident.priority_escalated_by && (
                <span className="badge bg-red-100 text-red-700 font-bold border border-red-200 animate-pulse">
                  <Flame size={12} className="inline mr-1" />
                  ESCALATED BY {incident.priority_escalated_by.toUpperCase()}
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-900 font-display">{incident.incident_type}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />
                {formatDate(incident.incident_date)} at {incident.incident_time?.slice(0,5)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={13} />
                {incident.main_location_name} › {incident.sub_location_name}
              </span>
              <span className="flex items-center gap-1.5">
                <User size={13} />
                {incident.reporter_name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="btn-secondary btn-sm print:hidden shadow-sm mr-2 border-slate-200">
              <Download size={14} />
              Generate PDF
            </button>
            <SeverityBadge severity={incident.severity} />
          </div>
        </div>

        {/* Action buttons */}
        {(canWithdraw || canHodFeedback || canRequestRedirect || canMdAct || canReopen || canEscalate || canRemindHod
          || (user?.id === incident.reporter_id && incident.status === 'submitted')
        ) && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-200 print:hidden">
            {/* Employee: edit their own incident while still submitted */}
            {user?.id === incident.reporter_id && incident.status === 'submitted' && (
              <button onClick={() => openEditIncident(incident)} className="btn-secondary btn-sm">
                <Pencil size={14} /> Edit Incident
              </button>
            )}
            {canWithdraw && (
              <button onClick={() => setShowWithdrawModal(true)} className="btn-secondary btn-sm border-red-200 text-red-600 hover:bg-red-50">
                <XCircle size={14} />
                Withdraw
              </button>
            )}
            {canHodFeedback && (
              <button onClick={() => setShowFeedbackModal(true)} className="btn-primary btn-sm">
                <MessageSquare size={14} />
                Submit Feedback
              </button>
            )}
            {canRequestRedirect && (
              <button onClick={() => setShowRedirectModal(true)} className="btn-secondary btn-sm border-orange-200 text-orange-700 hover:bg-orange-50">
                <AlertTriangle size={14} />
                Request Redirection to IMC
              </button>
            )}
            {canMdAct && (
              <button onClick={() => setShowMdModal(true)} className="btn-primary btn-sm">
                <CheckCircle size={14} />
                Close & Generate Report
              </button>
            )}
            {canReopen && (
              <button onClick={() => setShowReopenModal(true)} className="btn-ghost btn-sm text-slate-600">
                <Undo2 size={14} />
                Re-open
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
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 print:block print:space-y-5">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5 print:block">
          {/* Incident details */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Incident Details</h2>
            <div className="space-y-3 text-sm">
              <DetailRow icon={Building} label="Departments" value={(incident.departments||[]).map(d => typeof d === 'string' ? d : d.name).join(', ') || '—'} />
              <DetailRow icon={Users} label="Occurred To" value={incident.occurred_to} />
              <DetailRow icon={AlertTriangle} label="Severity" value={incident.severity} />
              <DetailRow icon={FileText} label="Category" value={incident.incident_category} />
              <DetailRow icon={FileText} label="Type" value={incident.incident_type} />
              {incident.has_responsible_person && (
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                  <DetailRow icon={User} label="Responsible Person" value={incident.responsible_person_name || '—'} />
                  {incident.training_completed ? (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
                      <CheckCircle size={14} /> Training Completed & Verified
                    </div>
                  ) : incident.status === 'pending_training' ? (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                      <AlertTriangle size={14} /> Mandatory Training Pending
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-2">Description</p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{incident.description}</p>
            </div>
          </div>

          {/* IMC Employee Training Verification Card */}
          {canImcAct && incident.status === 'pending_training' && (
            <div className="card p-5 border-amber-300 bg-amber-50/20 shadow-sm print:hidden">
              <div className="flex items-center gap-2 mb-3 border-b border-amber-200/60 pb-3">
                <UserCheck className="text-amber-700" size={18} />
                <h2 className="text-sm font-bold text-amber-900 uppercase tracking-wider">Mandatory Employee Training Verification</h2>
              </div>
              <p className="text-sm text-slate-700 mb-4">
                Management has mandated corrective training for <strong>{incident.responsible_person_name || 'the responsible employee'}</strong>. Once the employee has completed the required training modules, confirm below to formally resolve and close this incident.
              </p>
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

          {/* IMC Inline Review & Action Card */}
          {canImcAct && incident.status !== 'pending_training' && (
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
                  <div className="space-y-4">
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
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => imcFeedbackMutation.mutate()}
                        disabled={!feedbackText.trim() || imcFeedbackMutation.isPending}
                        className="btn-primary btn-sm"
                      >
                        {imcFeedbackMutation.isPending ? <Spinner size={12} /> : null}
                        Forward to Management
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Status messages for employees */}
          {user?.role === 'employee' && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Current Status</h2>
              <StatusMessage status={incident.status} />
            </div>
          )}

          {/* Feedbacks */}
          {feedbacks?.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Review History</h2>
              <div className="space-y-4">
                {feedbacks.map(fb => {
                  // Show Edit button only to the role that submitted this feedback
                  const canEditThisFb =
                    (fb.role === 'hod' && user?.role === 'hod') ||
                    (fb.role === 'imc' && user?.role === 'imc') ||
                    (fb.role === 'head_management' && user?.role === 'head_management');
                  return (
                    <div key={fb.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
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
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Final report */}
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

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Timeline */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Progress</h2>
            <div className="space-y-0">
              {TIMELINE_STAGES.map((stage, i) => {
                const done = statusOrder[incident.status] > i || (i === 4 && incident.status === 'resolved');
                const active = statusOrder[incident.status] === i || (i === 4 && incident.status === 'pending_training');
                return (
                  <div key={stage.key} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < TIMELINE_STAGES.length - 1 && (
                      <div className={`absolute left-3.5 top-7 bottom-0 w-px ${done ? 'bg-success-400' : 'bg-slate-200'}`} />
                    )}
                    <div className={`relative z-10 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-slate-200 text-slate-400'
                    }`}>
                      {done ? <CheckCircle size={14} /> : i + 1}
                    </div>
                    <div className="pt-1">
                      <p className={`text-sm font-medium ${active ? 'text-blue-700 font-bold' : done ? 'text-green-700' : 'text-slate-400'}`}>
                        {i === 4 && incident.status === 'pending_training' ? 'Training Verification (IMC)' : stage.label}
                      </p>
                      {active && <p className="text-xs text-blue-500 mt-0.5 flex items-center gap-1"><Clock size={11} /> In progress</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Attachments */}
          {attachments?.length > 0 && (
            <div className="card p-5 print:hidden">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Attachments ({attachments.length})</h2>
              <div className="space-y-2">
                {attachments.map(att => (
                  <div key={att.id} className="flex items-center justify-between w-full bg-slate-50 hover:bg-slate-100 rounded-lg p-2.5 border border-slate-200 transition-colors">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText size={13} className="text-slate-400 flex-shrink-0" />
                      <button
                        type="button"
                        onClick={() => setPreviewFile(att)}
                        className="truncate font-medium text-blue-600 hover:underline text-left text-xs"
                      >
                        {att.original_filename}
                      </button>
                      <span className="badge-gray px-1.5 py-0.5 text-[10px]">{att.stage}</span>
                    </div>
                    <a 
                      href={`${UPLOADS_URL}/${att.stored_filename}`}
                      download={att.original_filename}
                      className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                      title="Download"
                    >
                      <Download size={14} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Information</h2>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Submitted</dt>
                <dd className="text-slate-700 text-right">{formatDate(incident.created_at)}</dd>
              </div>
              {incident.resolved_at && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Resolved</dt>
                  <dd className="text-slate-700 text-right">{formatDate(incident.resolved_at)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* Withdraw Modal */}
      <Modal open={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} title="Withdraw Incident" size="sm"
        footer={<>
          <button onClick={() => setShowWithdrawModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={() => withdrawMutation.mutate()} disabled={!withdrawReason.trim() || withdrawMutation.isPending} className="btn-primary bg-red-600 hover:bg-red-700 border-red-600">
            {withdrawMutation.isPending ? <Spinner size={15} className="text-white" /> : null}
            Withdraw
          </button>
        </>}
      >
        <div>
          <label className="field-label field-required">Reason for withdrawal</label>
          <textarea
            value={withdrawReason}
            onChange={e => setWithdrawReason(e.target.value)}
            className="textarea"
            rows={3}
            placeholder="Please explain why you want to withdraw this incident..."
          />
        </div>
      </Modal>

      {/* File Preview Modal */}
      <Modal
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.original_filename || 'File Preview'}
        size="full"
        footer={
          <div className="flex justify-between w-full">
            {previewFile ? (
              <a 
                href={`${UPLOADS_URL}/${previewFile.stored_filename}`}
                download={previewFile.original_filename}
                className="btn-primary flex items-center gap-2"
              >
                <Download size={16} />
                Download
              </a>
            ) : <div />}
            <button onClick={() => setPreviewFile(null)} className="btn-secondary">Close</button>
          </div>
        }
      >
        {previewFile && (
          <div className="flex justify-center bg-slate-900 rounded-xl overflow-hidden" style={{ minHeight: '50vh', maxHeight: '80vh' }}>
            {previewFile.mime_type?.startsWith('image/') || previewFile.original_filename?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
              <img src={`${UPLOADS_URL}/${previewFile.stored_filename}`} alt="Preview" className="w-full h-full object-contain" />
            ) : previewFile.mime_type === 'application/pdf' || previewFile.original_filename?.endsWith('.pdf') ? (
              <iframe src={`${UPLOADS_URL}/${previewFile.stored_filename}`} className="w-full h-[80vh]" title="PDF Preview" />
            ) : (
              <div className="p-8 text-center bg-white w-full flex flex-col items-center justify-center">
                <FileText size={48} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-600 font-medium mb-2">Preview not available</p>
                <a 
                  href={`${UPLOADS_URL}/${previewFile.stored_filename}`}
                  download={previewFile.original_filename}
                  className="btn-primary inline-flex mt-2"
                >
                  Download
                </a>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Feedback Modal (HOD only now, since IMC has inline card) */}
      <Modal open={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} title="Submit Feedback" size="lg"
        footer={<>
          <button onClick={() => setShowFeedbackModal(false)} className="btn-secondary">Cancel</button>
          {canHodFeedback && (
            <button
              onClick={() => hodFeedbackMutation.mutate()}
              disabled={!feedbackText.trim() || !hodAcknowledged || hodFeedbackMutation.isPending}
              className="btn-primary"
            >
              {hodFeedbackMutation.isPending ? <Spinner size={15} className="text-white" /> : null}
              Submit Feedback
            </button>
          )}
        </>}
      >
        {canHodFeedback && (
          <div className="mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hodAcknowledged}
                onChange={e => setHodAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-slate-700">
                I acknowledge that I have reviewed the incident details and am providing feedback as Head of Department.
              </span>
            </label>
          </div>
        )}
        <label className="field-label field-required">Feedback</label>
        <textarea
          value={feedbackText}
          onChange={e => setFeedbackText(e.target.value)}
          className="textarea"
          rows={5}
          placeholder="Provide your detailed review and recommendations…"
        />
        <FileUploadArea files={hodAttachments} setFiles={setHodAttachments} />
      </Modal>

      {/* MD Decision Modal */}
      <Modal open={showMdModal} onClose={() => setShowMdModal(false)} title="Final Decision & Close Incident" size="lg"
        footer={<>
          <button onClick={() => setShowMdModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={() => mdMutation.mutate()} disabled={!mdFaultType || !mdActions.trim() || mdMutation.isPending} className="btn-primary">
            {mdMutation.isPending ? <Spinner size={15} className="text-white" /> : null}
            Close & Generate Report
          </button>
        </>}
      >
        <div className="space-y-4">
          <div>
            <label className="field-label field-required">Fault Type</label>
            <input value={mdFaultType} onChange={e => setMdFaultType(e.target.value)} className="input" placeholder="e.g. System Failure, Human Error, Process Gap…" />
          </div>
          <div>
            <label className="field-label field-required">Corrective Actions</label>
            <textarea value={mdActions} onChange={e => setMdActions(e.target.value)} className="textarea" rows={5} placeholder="Describe the corrective actions taken or recommended…" />
          </div>
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={mdRequireTraining}
                onChange={e => setMdRequireTraining(e.target.checked)}
                className="w-4 h-4 accent-blue-600 rounded"
              />
              <span className="text-sm font-semibold text-slate-800">
                Mandatory Training Required for Responsible Employee
              </span>
            </label>
            <p className="text-xs text-slate-500 mt-1 pl-7">
              If checked, this employee will be flagged for mandatory training, and the IMC authority will be assigned to verify training completion.
            </p>
          </div>
          <FileUploadArea files={mdAttachments} setFiles={setMdAttachments} />
        </div>
      </Modal>

      {/* Reopen Modal */}
      <Modal open={showReopenModal} onClose={() => setShowReopenModal(false)} title="Re-open Incident"
        footer={<>
          <button onClick={() => setShowReopenModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={() => reopenMutation.mutate()} disabled={!reopenReason.trim() || reopenMutation.isPending} className="btn-primary">
            Re-open
          </button>
        </>}
      >
        <Alert type="info" message="Re-opening will return this incident to IMC feedback. This action is logged." className="mb-4" />
        <label className="field-label field-required">Reason for re-opening</label>
        <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} className="textarea" rows={3} placeholder="Why is this incident being re-opened?" />
      </Modal>

      {/* Redirection Request Modal */}
      <Modal open={showRedirectModal} onClose={() => setShowRedirectModal(false)} title="Request Redirection to IMC"
        footer={<>
          <button onClick={() => setShowRedirectModal(false)} className="btn-secondary">Cancel</button>
          <button
            onClick={() => requestRedirectMutation.mutate()}
            disabled={!redirectReason.trim() || requestRedirectMutation.isPending}
            className="btn-danger bg-orange-600 hover:bg-orange-700 border-orange-600 focus:ring-orange-500"
          >
            {requestRedirectMutation.isPending ? <Spinner size={15} className="text-white" /> : null}
            Request Redirection
          </button>
        </>}
      >
        <Alert type="warning" message="This action will flag this incident as misrouted. The Incident Management Committee (IMC) will review your request and route it to the correct department HOD." className="mb-4" />
        <label className="field-label field-required">Reason for redirection request</label>
        <textarea
          value={redirectReason}
          onChange={e => setRedirectReason(e.target.value)}
          className="textarea"
          rows={4}
          placeholder="Please explain why this incident is not for your department, and suggest the correct department if possible…"
        />
      </Modal>

      {/* Reject Redirection Request Modal */}
      <Modal open={showRejectRedirectModal} onClose={() => setShowRejectRedirectModal(false)} title="Reject Redirection Request"
        footer={<>
          <button onClick={() => setShowRejectRedirectModal(false)} className="btn-secondary">Cancel</button>
          <button
            onClick={() => rejectRedirectMutation.mutate()}
            disabled={!rejectRedirectReason.trim() || rejectRedirectMutation.isPending}
            className="btn-danger focus:ring-red-500"
          >
            {rejectRedirectMutation.isPending ? <Spinner size={15} className="text-white" /> : null}
            Reject Request
          </button>
        </>}
      >
        <Alert type="warning" message="This will return the incident to the original department HOD for action." className="mb-4" />
        <label className="field-label field-required">Reason for Rejection</label>
        <textarea
          value={rejectRedirectReason}
          onChange={e => setRejectRedirectReason(e.target.value)}
          className="textarea"
          rows={4}
          placeholder="Please explain why the redirection request is denied..."
        />
      </Modal>

      {/* ── EDIT OWN FEEDBACK MODAL (HOD / IMC / Management) ── */}
      <Modal
        open={!!editFbModal}
        onClose={() => { setEditFbModal(null); setEditFbText(''); }}
        title={editFbModal ? `Edit ${editFbModal.feedbackType.replace('head_management','Management').replace('hod','HOD').replace('imc','IMC').toUpperCase()} Feedback` : ''}
        size="md"
        footer={
          <>
            <button onClick={() => { setEditFbModal(null); setEditFbText(''); }} className="btn-secondary">Cancel</button>
            <button
              disabled={editFeedbackMutation.isPending || !editFbText.trim()}
              onClick={() => editFeedbackMutation.mutate({ feedbackType: editFbModal.feedbackType, feedbackText: editFbText })}
              className="btn-primary disabled:opacity-60"
            >
              {editFeedbackMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        }
      >
        {editFbModal && (
          <div className="space-y-4 pt-1">
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
              <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700">
                You are editing your own <strong>{editFbModal.feedbackType.replace('head_management','Management').replace('hod','HOD').replace('imc','IMC')}</strong> feedback.
                This change will be recorded in the audit trail.
              </p>
            </div>
            <div>
              <label className="field-label field-required">Corrected Feedback</label>
              <textarea
                rows={5}
                value={editFbText}
                onChange={e => setEditFbText(e.target.value)}
                className="textarea"
                placeholder="Update your feedback…"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ── EDIT INCIDENT MODAL (Employee reporter, submitted status only) ── */}
      <Modal
        open={showEditIncModal}
        onClose={() => setShowEditIncModal(false)}
        title="Edit Incident"
        size="lg"
        footer={
          <>
            <button onClick={() => setShowEditIncModal(false)} className="btn-secondary">Cancel</button>
            <button
              disabled={editIncidentMutation.isPending || !editInc.description?.trim()}
              onClick={() => editIncidentMutation.mutate(editInc)}
              className="btn-primary disabled:opacity-60"
            >
              {editIncidentMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        }
      >
        <div className="space-y-4 pt-1">
          <Alert type="info" message="You can edit this incident only while it hasn't been reviewed by your HOD yet." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label field-required">Incident Date</label>
              <input
                type="date"
                value={editInc.incidentDate || ''}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setEditInc(p => ({ ...p, incidentDate: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="field-label field-required">Incident Time</label>
              <input
                type="time"
                value={editInc.incidentTime || ''}
                onChange={e => setEditInc(p => ({ ...p, incidentTime: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="field-label field-required">Occurred To</label>
              <select
                value={editInc.occurredTo || ''}
                onChange={e => setEditInc(p => ({ ...p, occurredTo: e.target.value }))}
                className="select"
              >
                <option value="">Select…</option>
                {OCCURRED_TO_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label field-required">Severity</label>
              <select
                value={editInc.severity || ''}
                onChange={e => setEditInc(p => ({ ...p, severity: e.target.value }))}
                className="select"
              >
                <option value="">Select…</option>
                {SEVERITY_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label field-required">
              Description
              <span className="text-slate-400 font-normal ml-1">({(editInc.description || '').length}/2000)</span>
            </label>
            <textarea
              rows={5}
              value={editInc.description || ''}
              onChange={e => setEditInc(p => ({ ...p, description: e.target.value }))}
              maxLength={2000}
              className="textarea"
              placeholder="Update the incident description…"
            />
          </div>
        </div>
      </Modal>
    </div>
    </>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 flex justify-between gap-4 min-w-0">
        <span className="text-slate-500 flex-shrink-0">{label}</span>
        <span className="text-slate-800 text-right font-medium truncate">{value || '—'}</span>
      </div>
    </div>
  );
}

function StatusMessage({ status }) {
  const msgs = {
    submitted: { type: 'info', msg: 'Your incident has been submitted successfully and is awaiting HOD feedback.' },
    with_hod: { type: 'info', msg: 'Your incident has been routed to the Head of Department and is currently awaiting their review and feedback.' },
    with_hod_and_imc: { type: 'info', msg: 'Due to grave severity, your incident is currently awaiting simultaneous review and feedback from both the HOD and IMC.' },
    with_imc: { type: 'info', msg: 'Your incident is currently awaiting review and feedback from the Incident Management Committee.' },
    with_head_management: { type: 'info', msg: 'Your incident is currently awaiting review and feedback from Hospital Management.' },
    resolved: { type: 'success', msg: 'Your incident has been resolved. View the final report below.' },
    withdrawn: { type: 'warning', msg: 'This incident has been withdrawn by you.' },
    redirect_requested: { type: 'warning', msg: 'A redirection request has been submitted to the IMC for routing to the correct department.' },
  };
  const { type, msg } = msgs[status] || { type: 'info', msg: 'Status updated.' };
  return <Alert type={type} message={msg} />;
}
