import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  FileText, Send, CheckCircle, Clock, Trash2, Edit3, Printer,
  Eye, AlertTriangle, ShieldCheck, Mail, Plus, Users
} from 'lucide-react';
import { Modal, Spinner, Alert, ConfirmDialog } from '../ui';
import { lettersApi } from '../../api';
import { getApiErrorMessage } from '../../utils/helpers';
import HospitalLetterhead from './HospitalLetterhead';
import toast from 'react-hot-toast';

export default function LettersCard({
  incident,
  letters = [],
  responsibleEmployees = [],
  user,
  isManagement,
  onOpenDraftModal,
  onDraftForEmployee,
  onEditDraft,
  onRefetch,
}) {
  const queryClient = useQueryClient();
  const [selectedViewLetter, setSelectedViewLetter] = useState(null);
  const [isSubmittingToMgmt, setIsSubmittingToMgmt] = useState(false);
  const [isMgmtDeciding, setIsMgmtDeciding] = useState(false);
  const [mgmtRejectModal, setMgmtRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [loadingPdfId, setLoadingPdfId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);

  const handleLetterPdf = async (letter, mode = 'view') => {
    if (!letter?.id || !incident?.id) return;
    setLoadingPdfId(letter.id);

    let previewWin = null;
    if (mode === 'view') {
      previewWin = window.open('', '_blank');
      if (previewWin) {
        try {
          previewWin.opener = null;
        } catch {
          // ignore
        }
      }
    }

    try {
      const response = await lettersApi.downloadPdf(incident.id, letter.id);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const safeName = `${(letter.reference_number || letter.ref_number || 'letter').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

      if (mode === 'download' || !previewWin || previewWin.closed) {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = safeName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      } else {
        previewWin.location.href = blobUrl;
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      }
    } catch (err) {
      if (previewWin && !previewWin.closed) {
        previewWin.close();
      }
      let message = 'Failed to load official PDF.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          if (parsed?.error) message = parsed.error;
        } catch {
          // keep fallback
        }
      } else {
        message = getApiErrorMessage(err, message);
      }
      toast.error(message);
    } finally {
      setLoadingPdfId(null);
    }
  };

  const isImcLead = Boolean(user?.is_imc_lead || user?.isImcLead || user?.is_system_admin || user?.role === 'system_admin');
  const isMgmtUser = Boolean(isManagement || user?.role === 'head_management' || user?.role === 'system_admin');

  const employeeLetters = (letters || []).filter(
    l =>
      !['trainer_appointment', 'trainer_appointment_letter'].includes(l.template_type) &&
      !['trainer_appointment', 'trainer_appointment_letter'].includes(l.letter_type)
  );

  const isPendingLetterGeneration = incident?.status === 'pending_letter_generation';
  const isPendingMgmtApproval = incident?.status === 'pending_management_letter_approval';
  const hasTrainingRequirement = Boolean(incident?.needs_training);

  const employeeLetterCounts = employeeLetters.reduce((acc, l) => {
    const key = l.employee_id || l.recipient_name || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const uniqueEmployeesCount = Object.keys(employeeLetterCounts).length;

  const invalidateLetterRelatedQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['incident', String(incident?.id)] });
    queryClient.invalidateQueries({ queryKey: ['incidents'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };

  const executeDeleteDraft = async (letterId) => {
    try {
      await lettersApi.deleteDraft(incident.id, letterId);
      toast.success('Draft deleted.');
      invalidateLetterRelatedQueries();
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete draft.'));
    }
  };

  const handleSubmitToManagement = async () => {
    if (employeeLetters.length === 0) {
      toast.error('Please draft at least one letter before submitting to Management.');
      return;
    }
    setIsSubmittingToMgmt(true);
    try {
      await lettersApi.submitToManagement(incident.id);
      toast.success('Letter(s) submitted to Executive Management for approval.');
      invalidateLetterRelatedQueries();
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to submit letters.'));
    } finally {
      setIsSubmittingToMgmt(false);
    }
  };

  const executeManagementApproval = async () => {
    setIsMgmtDeciding(true);
    try {
      const res = await lettersApi.managementDecision(incident.id, {
        action: 'APPROVE',
        decision: 'approve',
      });
      toast.success(res.data?.message || 'Letters approved and dispatched successfully.');
      invalidateLetterRelatedQueries();
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to approve letters.'));
    } finally {
      setIsMgmtDeciding(false);
    }
  };

  const handleManagementRejection = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please specify reasons/instructions for letter revision.');
      return;
    }
    setIsMgmtDeciding(true);
    try {
      await lettersApi.managementDecision(incident.id, {
        action: 'REJECT_REVISION',
        decision: 'reject',
        revisionNotes: rejectReason,
        notes: rejectReason,
      });
      toast.success('Letters returned to IMC for revision.');
      setMgmtRejectModal(false);
      setRejectReason('');
      invalidateLetterRelatedQueries();
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to return letters.'));
    } finally {
      setIsMgmtDeciding(false);
    }
  };

  const getTemplateTypeBadge = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('penalty')) {
      return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">Warning &amp; Financial Penalty</span>;
    }
    if (t.includes('warning')) {
      return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">Warning Letter</span>;
    }
    if (t.includes('training')) {
      return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">Mandatory Training Directive</span>;
    }
    if (t.includes('advisory')) {
      return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">Advisory Letter</span>;
    }
    if (t.includes('suggestion')) {
      return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">Suggestion Letter</span>;
    }
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">Official Letter</span>;
  };

  if (!employeeLetters.length && !isPendingLetterGeneration && !isPendingMgmtApproval) {
    return null;
  }

  const revisionNotes = employeeLetters.find(l => l.revision_notes)?.revision_notes;
  const staffList = responsibleEmployees.length > 0 ? responsibleEmployees : (incident?.responsible_employees || []);

  const getCleanEmpNo = (l) =>
    [l.employee_code, l.recipient_emp_no, l.emp_id, l.employee_id].find(
      val => val && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val).trim())
    );

  return (
    <>
      <div className="card p-5 border border-indigo-200 bg-white shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
              <FileText size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800">Formal Disciplinary &amp; Advisory Letters</h2>
                {employeeLetters.length > 0 && (
                  <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {employeeLetters.length} Letter{employeeLetters.length === 1 ? '' : 's'} ({uniqueEmployeesCount} Staff)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Official disciplinary, penalty, advisory, and recommendation notices with scannable IMS QR codes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPendingLetterGeneration && isImcLead && staffList.length === 0 && (
              <button
                type="button"
                onClick={onOpenDraftModal}
                className="btn-primary btn-sm text-xs flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm"
              >
                <Plus size={14} />
                {employeeLetters.length > 0 ? 'Draft Another Letter' : 'Draft Letter'}
              </button>
            )}
          </div>
        </div>

        {isPendingLetterGeneration && revisionNotes && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-rose-800">
              <AlertTriangle size={14} className="text-rose-600" />
              Management Requested Revision on Letter(s):
            </div>
            <p className="text-rose-700 italic bg-white p-2 rounded border border-rose-100">
              &ldquo;{revisionNotes}&rdquo;
            </p>
          </div>
        )}

        {isPendingLetterGeneration && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1 max-w-xl">
              <p className="font-bold flex items-center gap-1.5 text-amber-800">
                <Clock size={14} className="text-amber-600" /> Disciplinary Letter Drafting in Progress (IMC Convenor)
              </p>
              <p className="text-amber-700 text-[11px] leading-relaxed">
                Management has ordered formal disciplinary/advisory outcomes. Draft notices for involved staff and forward them together to Management for approval.
                {hasTrainingRequirement && (
                  <span className="block mt-1 font-semibold text-indigo-800">
                    Note: Mandatory training is handled concurrently via Trainer Appointment in the Training card below.
                  </span>
                )}
              </p>
            </div>

            {isImcLead && employeeLetters.length > 0 && (
              <button
                type="button"
                onClick={handleSubmitToManagement}
                disabled={isSubmittingToMgmt}
                className="btn-primary btn-sm text-xs bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 whitespace-nowrap shadow-sm ml-auto"
              >
                {isSubmittingToMgmt ? <Spinner size={12} className="text-white" /> : <Send size={12} />}
                Submit {employeeLetters.length} Letter{employeeLetters.length === 1 ? '' : 's'} to Management
              </button>
            )}
          </div>
        )}

        {isPendingMgmtApproval && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-900 space-y-3">
            <div>
              <p className="font-bold flex items-center gap-1.5 text-indigo-800 text-sm">
                <ShieldCheck size={16} className="text-indigo-600" /> Awaiting Management Approval &amp; Dispatch
              </p>
              <p className="text-indigo-700 text-[11px] mt-0.5 leading-relaxed">
                The IMC Convenor has finalized <strong>{employeeLetters.length} formal letter(s)</strong> across {uniqueEmployeesCount} employee(s). Upon Management approval, official letters with verified IMS QR codes will be dispatched via email.
                {hasTrainingRequirement && (
                  <span className="block mt-1 text-blue-800 font-semibold">
                    Since training is also mandated, this incident will remain active for the Mandatory Training stage after letter dispatch.
                  </span>
                )}
              </p>
            </div>

            {isMgmtUser && (
              <div className="flex items-center gap-2 pt-2 border-t border-indigo-100 flex-wrap">
                <button
                  type="button"
                  onClick={() => setApproveConfirmOpen(true)}
                  disabled={isMgmtDeciding}
                  className="btn-primary btn-sm text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-600 flex items-center gap-1.5 shadow-sm"
                >
                  {isMgmtDeciding ? <Spinner size={12} className="text-white" /> : <Mail size={13} />}
                  Approve &amp; Dispatch {employeeLetters.length > 1 ? `All ${employeeLetters.length} Letters` : 'Letter'} via Email ({hasTrainingRequirement ? 'Keep Training Active' : 'Close Incident'})
                </button>
                <button
                  type="button"
                  onClick={() => setMgmtRejectModal(true)}
                  disabled={isMgmtDeciding}
                  className="btn-secondary btn-sm text-xs text-rose-700 hover:bg-rose-50 border-rose-200"
                >
                  Request Letter Revision
                </button>
              </div>
            )}
          </div>
        )}

        {staffList.length > 0 && (
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Users size={14} className="text-indigo-600" />
                Involved Staff Roster &amp; Action Status ({staffList.length})
              </span>
              <span className="text-[10px] text-slate-500">
                Track individual directives &amp; drafted letters per employee
              </span>
            </div>

            <div className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200 overflow-hidden">
              {staffList.map(emp => {
                const empId = emp.employee_id || emp.emp_id || emp.id;
                const empLetters = employeeLetters.filter(
                  l => l.employee_id === empId || l.recipient_name === (emp.full_name || emp.name)
                );
                const empCode =
                  emp.emp_id || emp.employee_code || emp.employee_no ||
                  (emp.employee_id && emp.employee_id.length < 20 ? emp.employee_id : '') || '';

                return (
                  <div key={empId} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900">
                          {emp.full_name || emp.name}
                        </span>
                        {empCode && (
                          <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {empCode}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500">
                          {[emp.designation, emp.department_name || emp.department].filter(Boolean).join(' • ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {empLetters.length > 0 ? (
                          empLetters.map(l => (
                            <button
                              key={l.id}
                              type="button"
                              onClick={() => setSelectedViewLetter(l)}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-2 py-0.5 rounded transition-colors"
                              title="Click to preview official letterhead"
                            >
                              <FileText size={10} />
                              {l.ref_number || l.reference_number || 'Draft'}: {l.template_type?.replace(/_/g, ' ') || 'Letter'}
                            </button>
                          ))
                        ) : (
                          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-medium">
                            No letter drafted yet
                          </span>
                        )}
                      </div>
                    </div>

                    {isPendingLetterGeneration && isImcLead && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onDraftForEmployee) onDraftForEmployee(emp);
                          else onOpenDraftModal();
                        }}
                        className="btn-secondary btn-sm text-[11px] flex items-center gap-1 hover:border-indigo-400 hover:text-indigo-700 whitespace-nowrap ml-auto"
                      >
                        <Plus size={12} />
                        {empLetters.length > 0 ? 'Draft Another Letter' : 'Draft Letter for Staff'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {employeeLetters.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No formal letters drafted yet for this incident.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {employeeLetters.map(letter => {
              const isApproved = letter.status === 'approved' || letter.status === 'dispatched';
              const isDraft = letter.status === 'draft' || letter.status === 'drafted';
              const isSubmitted = letter.status === 'submitted_to_management';
              const isRejected = letter.status === 'rejected';

              const empKey = letter.employee_id || letter.recipient_name;
              const hasMultipleLettersForEmp = (employeeLetterCounts[empKey] || 0) > 1;
              const cleanEmpNo = getCleanEmpNo(letter);

              return (
                <div
                  key={letter.id}
                  className="p-3.5 rounded-xl border bg-slate-50/70 border-slate-200 hover:border-indigo-200 hover:shadow-xs transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {letter.ref_number || letter.reference_number || 'PENDING REF'}
                        </span>
                        {getTemplateTypeBadge(letter.template_type || letter.letter_type)}
                      </div>
                      <h4 className="text-xs font-bold text-slate-800 mt-1 truncate">
                        {letter.employee_name || letter.recipient_name || 'Staff Member'}
                      </h4>
                      <p className="text-[10px] text-slate-500 truncate">
                        {[cleanEmpNo, letter.employee_designation || letter.recipient_designation, letter.employee_department || letter.recipient_department]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {isApproved && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle size={10} /> Dispatched
                        </span>
                      )}
                      {isSubmitted && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full border border-indigo-200">
                          <Clock size={10} /> In Mgmt Review
                        </span>
                      )}
                      {isDraft && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                          <Edit3 size={10} /> Draft
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
                          <AlertTriangle size={10} /> Needs Revision
                        </span>
                      )}
                    </div>
                  </div>

                  {hasMultipleLettersForEmp && (
                    <div className="text-[10px] font-medium text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded flex items-center gap-1">
                      <Users size={11} /> Multi-letter outcome for this staff
                    </div>
                  )}

                  <div className="text-[11px] text-slate-600 line-clamp-2 bg-white p-2 rounded border border-slate-100">
                    <strong>Subject:</strong> {letter.subject}
                  </div>

                  {letter.penalty_amount && (
                    <div className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                      Monetary Penalty: ₹{Number(letter.penalty_amount).toLocaleString('en-IN')} {letter.penalty_amount_words ? `(${letter.penalty_amount_words})` : ''}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedViewLetter(letter)}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 text-[11px]"
                      >
                        <Eye size={12} /> View Letterhead
                      </button>
                      <button
                        type="button"
                        disabled={loadingPdfId === letter.id}
                        onClick={() => handleLetterPdf(letter, 'view')}
                        className="text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-1 text-[11px] disabled:opacity-50"
                        title="Download or preview authentic letterhead PDF"
                      >
                        <FileText size={12} /> {loadingPdfId === letter.id ? 'Loading…' : 'PDF'}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(isDraft || isRejected || isPendingLetterGeneration) && isImcLead && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditDraft(letter)}
                            className="px-2 py-0.5 rounded text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors flex items-center gap-1"
                            title="Edit / Revise Letter"
                          >
                            <Edit3 size={11} /> Edit Letter
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(letter.id)}
                            className="px-2 py-0.5 rounded text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors flex items-center gap-1"
                            title="Delete / Discard Letter"
                          >
                            <Trash2 size={11} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Letterhead Modal */}
      {selectedViewLetter && (
        <Modal
          open={Boolean(selectedViewLetter)}
          onClose={() => setSelectedViewLetter(null)}
          title={`Official Letterhead: ${selectedViewLetter.ref_number || selectedViewLetter.reference_number || 'Draft'}`}
          size="full"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-slate-500 font-medium">
                Status: <strong className="uppercase">{(selectedViewLetter.status || 'drafted').replace('_', ' ')}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={loadingPdfId === selectedViewLetter.id}
                  onClick={() => handleLetterPdf(selectedViewLetter, 'download')}
                  className="btn-primary text-xs flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50"
                >
                  <FileText size={14} /> {loadingPdfId === selectedViewLetter.id ? 'Generating…' : 'Download Official PDF'}
                </button>
                <button
                  type="button"
                  disabled={loadingPdfId === selectedViewLetter.id}
                  onClick={() => handleLetterPdf(selectedViewLetter, 'view')}
                  className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Printer size={14} /> Print / View PDF
                </button>
                <button type="button" onClick={() => setSelectedViewLetter(null)} className="btn-secondary text-xs">
                  Close
                </button>
              </div>
            </div>
          }
        >
          <HospitalLetterhead
            refNumber={selectedViewLetter.ref_number || selectedViewLetter.reference_number}
            letterDate={selectedViewLetter.letter_date}
            recipientName={selectedViewLetter.employee_name || selectedViewLetter.recipient_name}
            recipientEmpNo={getCleanEmpNo(selectedViewLetter)}
            recipientDepartment={selectedViewLetter.employee_department || selectedViewLetter.recipient_department}
            recipientDesignation={selectedViewLetter.employee_designation || selectedViewLetter.recipient_designation}
            subject={selectedViewLetter.subject}
            salutation={selectedViewLetter.salutation}
            bodyContent={selectedViewLetter.body_content || selectedViewLetter.body_text}
            penaltyAmount={selectedViewLetter.penalty_amount}
            penaltyAmountWords={selectedViewLetter.penalty_amount_words}
            status={selectedViewLetter.status}
            draftedByName={selectedViewLetter.drafted_by_name || 'Incident Management Committee Convenor'}
            approvedByName={selectedViewLetter.approved_by_name}
            approvedAt={selectedViewLetter.approved_at}
            ccList={selectedViewLetter.cc_list || selectedViewLetter.cc_recipients || []}
            qrCodeUrl={selectedViewLetter.qr_code_url || selectedViewLetter.qr_code_data}
            verifyUrl={`${window.location.origin}/incidents/${incident?.id || selectedViewLetter.incident_id}`}
          />
        </Modal>
      )}

      {/* Management Reject / Revise Modal */}
      <Modal
        open={mgmtRejectModal}
        onClose={() => setMgmtRejectModal(false)}
        title="Return Letters to IMC for Revision"
        size="md"
        footer={
          <>
            <button onClick={() => setMgmtRejectModal(false)} className="btn-secondary text-xs">Cancel</button>
            <button
              onClick={handleManagementRejection}
              disabled={isMgmtDeciding || !rejectReason.trim()}
              className="btn-danger text-xs"
            >
              {isMgmtDeciding && <Spinner size={12} className="text-white" />} Return to IMC
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert type="warning" message="This will return the incident back to the IMC with status 'Drafting Letter(s)'. Please provide revision instructions." />
          <div>
            <label className="field-label field-required text-xs">Revision Instructions / Notes</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              className="textarea text-xs"
              rows={4}
              placeholder="Specify required changes in wording, penalty amount, or recipient details…"
            />
          </div>
        </div>
      </Modal>

      {/* Delete Draft ConfirmDialog */}
      <ConfirmDialog
        open={Boolean(deleteConfirmId)}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => {
          const idToDelete = deleteConfirmId;
          setDeleteConfirmId(null);
          if (idToDelete) executeDeleteDraft(idToDelete);
        }}
        title="Delete Letter Draft"
        message="Are you sure you want to delete this letter draft? This cannot be undone."
        confirmLabel="Delete Draft"
        danger={true}
      />

      {/* Management Approval ConfirmDialog */}
      <ConfirmDialog
        open={approveConfirmOpen}
        onClose={() => setApproveConfirmOpen(false)}
        onConfirm={() => {
          setApproveConfirmOpen(false);
          executeManagementApproval();
        }}
        title="Approve & Dispatch Official Letters"
        message={
          hasTrainingRequirement
            ? `Approve all ${employeeLetters.length} drafted letter(s) and dispatch them via email? Because mandatory training is also ordered, the incident will remain active for training completion.`
            : `Approve all ${employeeLetters.length} drafted letter(s) and dispatch them via email? This will officially mark the incident as closed.`
        }
        confirmLabel="Approve & Dispatch"
      />
    </>
  );
}
