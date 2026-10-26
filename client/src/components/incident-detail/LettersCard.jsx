import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  FileText, Send, CheckCircle, Clock, Trash2, Edit3, Printer, 
  Eye, QrCode, AlertTriangle, Building, ShieldCheck, Mail, Plus, 
  Users, ExternalLink, RefreshCw 
} from 'lucide-react';
import { Modal, Spinner, Alert } from '../ui';
import { lettersApi } from '../../api';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function LettersCard({
  incident,
  letters = [],
  responsibleEmployees = [],
  user,
  canImcAct,
  isManagement,
  onOpenDraftModal,
  onDraftForEmployee,
  onEditDraft,
  onRefetch
}) {
  const queryClient = useQueryClient();
  const [selectedViewLetter, setSelectedViewLetter] = useState(null);
  const [isSubmittingToMgmt, setIsSubmittingToMgmt] = useState(false);
  const [isMgmtDeciding, setIsMgmtDeciding] = useState(false);
  const [mgmtRejectModal, setMgmtRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const isImcLead = Boolean(user?.is_imc_lead || user?.isImcLead || user?.role === 'imc' || user?.is_system_admin || user?.role === 'system_admin');
  const isMgmtUser = Boolean(isManagement || user?.role === 'head_management' || user?.role === 'system_admin');

  // Filter to employee disciplinary/advisory letters (trainer appointment letters are handled in TrainingProgressCard)
  const employeeLetters = (letters || []).filter(
    l => !['trainer_appointment', 'trainer_appointment_letter'].includes(l.template_type) &&
         !['trainer_appointment', 'trainer_appointment_letter'].includes(l.letter_type)
  );

  const pendingDraftsCount = employeeLetters.filter(l => l.status === 'draft' || l.status === 'drafted').length;
  const isPendingLetterGeneration = incident?.status === 'pending_letter_generation';
  const isPendingMgmtApproval = incident?.status === 'pending_management_letter_approval';

  // Check if incident requires training
  const hasTrainingRequirement = Boolean(incident?.needs_training);

  // Group letters count per employee to identify multi-letter scenarios
  const employeeLetterCounts = employeeLetters.reduce((acc, l) => {
    const key = l.employee_id || l.recipient_name || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const uniqueEmployeesCount = Object.keys(employeeLetterCounts).length;

  const invalidateLetterRelatedQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['incident', incident?.id] });
    queryClient.invalidateQueries({ queryKey: ['incidents'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['all-incidents-analytics'] });
  };

  const handleDeleteDraft = async (letterId) => {
    if (!window.confirm('Are you sure you want to delete this letter draft?')) return;
    try {
      await lettersApi.deleteDraft(incident.id, letterId);
      toast.success('Draft deleted.');
      invalidateLetterRelatedQueries();
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete draft.');
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
      toast.error(err.response?.data?.error || 'Failed to submit letters.');
    } finally {
      setIsSubmittingToMgmt(false);
    }
  };

  const handleManagementApproval = async () => {
    const confirmMessage = hasTrainingRequirement
      ? `Approve all ${employeeLetters.length} drafted disciplinary letter(s) and dispatch them to the employee(s) and CC recipients via email?\n\nNote: Because mandatory training is also ordered, disciplinary letters will be dispatched now, and the incident will remain active for training completion.`
      : `Approve all ${employeeLetters.length} drafted letter(s) and dispatch them to the employee(s) and CC recipients via email?\n\nThis will officially mark the incident as CLOSED.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }
    setIsMgmtDeciding(true);
    try {
      const res = await lettersApi.managementDecision(incident.id, { 
        action: 'APPROVE', 
        decision: 'approve' 
      });
      toast.success(res.data?.message || 'Letters approved and dispatched successfully.');
      invalidateLetterRelatedQueries();
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to approve letters.');
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
        notes: rejectReason 
      });
      toast.success('Letters returned to IMC for revision.');
      setMgmtRejectModal(false);
      setRejectReason('');
      invalidateLetterRelatedQueries();
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to return letters.');
    } finally {
      setIsMgmtDeciding(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getTemplateTypeBadge = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('penalty')) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
          Warning & Financial Penalty
        </span>
      );
    }
    if (t.includes('warning')) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
          Warning Letter
        </span>
      );
    }
    if (t.includes('training')) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
          Mandatory Training Directive
        </span>
      );
    }
    if (t.includes('advisory')) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
          Advisory Letter
        </span>
      );
    }
    if (t.includes('suggestion')) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
          Suggestion Letter
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
        Official Letter
      </span>
    );
  };

  if (!employeeLetters.length && !isPendingLetterGeneration && !isPendingMgmtApproval) {
    return null;
  }

  // Any revision notes on the letters?
  const revisionNotes = employeeLetters.find(l => l.revision_notes)?.revision_notes;

  return (
    <>
      <div className="card p-5 border border-indigo-200 bg-white shadow-sm space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
              <FileText size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800">Formal Disciplinary & Advisory Letters</h2>
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

          {/* Action buttons on top right (only if no staff roster exists below, avoiding duplicate buttons) */}
          <div className="flex items-center gap-2">
            {isPendingLetterGeneration && isImcLead && !(responsibleEmployees.length > 0 || (incident?.responsible_employees || []).length > 0) && (
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

        {/* Returned for Revision Alert */}
        {isPendingLetterGeneration && revisionNotes && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-rose-800">
              <AlertTriangle size={14} className="text-rose-600" />
              Management Requested Revision on Letter(s):
            </div>
            <p className="text-rose-700 italic bg-white p-2 rounded border border-rose-100">
              "{revisionNotes}"
            </p>
          </div>
        )}

        {/* Workflow Status Banner: IMC Drafting */}
        {isPendingLetterGeneration && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1 max-w-xl">
              <p className="font-bold flex items-center gap-1.5 text-amber-800">
                <Clock size={14} className="text-amber-600" /> Disciplinary Letter Drafting in Progress (IMC Level)
              </p>
              <p className="text-amber-700 text-[11px] leading-relaxed">
                Management has ordered formal disciplinary/advisory outcome. The IMC can draft multiple letters for each involved employee (e.g., penalty warning, advisory, or suggestion letter) and forward them together to Management for approval.
                {hasTrainingRequirement && (
                  <span className="block mt-1 font-semibold text-indigo-800">
                    💡 Note: Mandatory training is handled concurrently via Trainer Appointment in the Training card below.
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

        {/* Workflow Status Banner: Management Approval */}
        {isPendingMgmtApproval && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-900 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold flex items-center gap-1.5 text-indigo-800 text-sm">
                  <ShieldCheck size={16} className="text-indigo-600" /> Awaiting Management Approval & Dispatch
                </p>
                <p className="text-indigo-700 text-[11px] mt-0.5 leading-relaxed">
                  The IMC has finalized <strong>{employeeLetters.length} formal letter(s)</strong> across {uniqueEmployeesCount} employee(s). Upon Management approval, official letters with verified IMS QR codes will be dispatched to each employee and their respective department leadership via email.
                  {hasTrainingRequirement && (
                    <span className="block mt-1 text-blue-800 font-semibold">
                      📌 Since training is also mandated, this incident will proceed to the Mandatory Training stage after letter dispatch.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {isMgmtUser && (
              <div className="flex items-center gap-2 pt-2 border-t border-indigo-100 flex-wrap">
                <button
                  type="button"
                  onClick={handleManagementApproval}
                  disabled={isMgmtDeciding}
                  className="btn-primary btn-sm text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-600 flex items-center gap-1.5 shadow-sm"
                >
                  {isMgmtDeciding ? <Spinner size={12} className="text-white" /> : <Mail size={13} />}
                  Approve & Dispatch {employeeLetters.length > 1 ? `All ${employeeLetters.length} Letters` : 'Letter'} via Email ({hasTrainingRequirement ? 'Keep Training Active' : 'Close Incident'})
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

        {/* Involved Staff Outcome Matrix */}
        {(() => {
          const staffList = responsibleEmployees.length > 0 ? responsibleEmployees : (incident?.responsible_employees || []);
          if (!staffList.length) return null;

          return (
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Users size={14} className="text-indigo-600" />
                  Involved Staff Roster & Action Status ({staffList.length})
                </span>
                <span className="text-[10px] text-slate-500">
                  Track individual directives & drafted letters per employee
                </span>
              </div>

              <div className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200 overflow-hidden">
                {staffList.map(emp => {
                  const empId = emp.employee_id || emp.emp_id || emp.id;
                  const empLetters = employeeLetters.filter(
                    l => l.employee_id === empId || l.recipient_name === (emp.full_name || emp.name)
                  );

                  return (
                    <div key={empId} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900">
                            {emp.full_name || emp.name}
                          </span>
                          {(() => {
                            const empCode = emp.emp_id || emp.employee_code || emp.employee_no || (emp.employee_id && emp.employee_id.length < 20 ? emp.employee_id : '') || '';
                            return empCode ? (
                              <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {empCode}
                              </span>
                            ) : null;
                          })()}
                          <span className="text-[10px] text-slate-500">
                            {[emp.designation, emp.department_name || emp.department].filter(Boolean).join(' • ')}
                          </span>
                        </div>

                        {/* Drafted letters badges */}
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
                              ⚠️ No letter drafted yet
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action button */}
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
          );
        })()}

        {/* Letters List */}
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
                        {[
                          letter.employee_code || letter.recipient_emp_no,
                          letter.employee_designation || letter.recipient_designation,
                          letter.employee_department || letter.recipient_department
                        ].filter(Boolean).join(' • ')}
                      </p>
                    </div>

                    {/* Status Badge */}
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

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedViewLetter(letter)}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 text-[11px]"
                      >
                        <Eye size={12} /> View Letterhead
                      </button>
                      <a
                        href={lettersApi.getPdfUrl(incident.id, letter.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.currentTarget.href = lettersApi.getPdfUrl(incident.id, letter.id);
                        }}
                        className="text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-1 text-[11px]"
                        title="Download or preview authentic letterhead PDF"
                      >
                        <FileText size={12} /> PDF
                      </a>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(isDraft || isRejected || letter.status === 'rejected' || isPendingLetterGeneration) && isImcLead && (
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
                            onClick={() => handleDeleteDraft(letter.id)}
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

      {/* --- OFFICIAL HOSPITAL LETTERHEAD MODAL --- */}
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
                <a
                  href={lettersApi.getPdfUrl(incident.id, selectedViewLetter.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.currentTarget.href = lettersApi.getPdfUrl(incident.id, selectedViewLetter.id);
                  }}
                  download={`${(selectedViewLetter.reference_number || selectedViewLetter.ref_number || 'letter').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`}
                  className="btn-primary text-xs flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  <FileText size={14} /> Download Official PDF
                </a>
                <button
                  type="button"
                  onClick={() => window.open(lettersApi.getPdfUrl(incident.id, selectedViewLetter.id), '_blank')}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Printer size={14} /> Print / View PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedViewLetter(null)}
                  className="btn-secondary text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          }
        >
          {/* Authentic A4 Document Canvas / Desk Backdrop */}
          <div className="bg-slate-300/80 -m-5 p-4 sm:p-8 flex justify-center overflow-y-auto max-h-[78vh]">
            {/* Authentic A4 Sheet (210mm x 297mm proportions) */}
            <div className="w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-800 shadow-[0_8px_30px_rgba(0,0,0,0.18),0_1px_4px_rgba(0,0,0,0.08)] border border-slate-300 relative flex flex-col justify-between select-text my-auto font-sans">
              
              {/* Central Fixed Watermark (60% width, 7% opacity) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img
                  src="/letterhead/jph-round-watermark.png"
                  alt="JPH Watermark"
                  className="w-[125mm] max-w-[58%] opacity-[0.07] object-contain select-none"
                />
              </div>

              {/* Faint DRAFT Watermark Banner (if not yet approved/dispatched) */}
              {!['approved', 'dispatched'].includes(selectedViewLetter.status) && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                  <span className="text-5xl font-black text-rose-500/[0.08] uppercase tracking-[0.35em] -rotate-45 select-none whitespace-nowrap">
                    DRAFT — FOR REVIEW
                  </span>
                </div>
              )}

              {/* Top Section: Official Letterhead Header */}
              <div className="relative z-10 bg-white">
                {/* Top Green Band with Lime Wedge & White Accent */}
                <div className="relative w-full h-3 bg-[#146537] overflow-hidden">
                  <div className="absolute top-0 left-0 w-9 h-full bg-[#8DC63F] -skew-x-[35deg] -ml-2"></div>
                  <div className="absolute top-0 left-8 w-1.5 h-full bg-white -skew-x-[35deg]"></div>
                </div>

                {/* Header Content */}
                <div className="px-6 sm:px-[18mm] py-2.5 flex items-center justify-between border-b border-slate-200 bg-white">
                  {/* Brand Logo & Doc Control */}
                  <div className="flex flex-col justify-center">
                    <img
                      src="/letterhead/jph-header-logo.png"
                      alt="Jaiprakash Hospital"
                      className="h-10 object-contain object-left"
                    />
                    <div className="text-[9px] font-semibold text-slate-600 mt-1 tracking-tight">
                      Doc. No.: JPHRC/GNR/FRM/004A
                    </div>
                  </div>

                  {/* Hospital Info & NABH (Single Unit, Aligned to Right) */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Vertical Divider */}
                    <div className="w-[1.5px] h-14 bg-slate-300 shrink-0"></div>

                    {/* Contact Information */}
                    <div className="text-[8.5px] leading-[1.38] text-slate-700 whitespace-nowrap">
                      <div>
                        <span className="text-[#146537] font-bold">📍 Main Hospital :</span> Dayanand Nagar, Rourkela-769004, Odisha
                      </div>
                      <div>
                        <span className="text-[#146537] font-bold">📞 Helpline No. :</span> 9779 109 109
                      </div>
                      <div>✉️ info@jaiprakashhospitals.com</div>
                      <div>🌐 www.jaiprakashhospitals.com</div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        CIN : U85120OR2008PTC029111
                      </div>
                    </div>

                    {/* NABH Badge */}
                    <div className="shrink-0 pl-1">
                      <img
                        src="/letterhead/nabh-accredited-logo.svg"
                        alt="NABH Accredited"
                        className="h-14 w-auto object-contain"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Section: Printable Letter Body (18mm margins matching PDF) */}
              <div className="relative z-10 px-6 sm:px-[18mm] pt-4 pb-6 flex-1 flex flex-col justify-between text-[10pt] text-slate-800 leading-relaxed">
                <div className="space-y-3.5">
                  {/* Ref No & Date */}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 text-[10pt] font-semibold text-slate-900">
                    <div>
                      Ref No: <span className="font-mono text-slate-900">{selectedViewLetter.ref_number || selectedViewLetter.reference_number}</span>
                    </div>
                    <div>
                      Date: <span className="text-slate-900">{formatDate(selectedViewLetter.letter_date)}</span>
                    </div>
                  </div>

                  {/* Recipient Addressee Block */}
                  <div className="bg-[#f8fafc] border-l-[3.5px] border-[#146537] px-3.5 py-2 rounded text-[9.5pt] leading-[1.45] text-slate-800 space-y-0.5">
                    <p className="font-bold text-slate-900 text-[10pt]">To,</p>
                    <p className="font-bold text-[10.5pt] text-[#146537]">
                      {selectedViewLetter.employee_name || selectedViewLetter.recipient_name}
                    </p>
                    {(selectedViewLetter.employee_code || selectedViewLetter.recipient_emp_no || selectedViewLetter.employee_id) && (
                      <p className="text-slate-600 font-medium text-[9pt]">
                        Emp. ID: <span className="font-mono text-slate-800">{selectedViewLetter.employee_code || selectedViewLetter.recipient_emp_no || selectedViewLetter.employee_id}</span>
                      </p>
                    )}
                    <p className="text-slate-600 text-[9pt]">
                      Department: <span className="font-semibold text-slate-800">{selectedViewLetter.employee_department || selectedViewLetter.recipient_department}</span>
                      {(selectedViewLetter.employee_designation || selectedViewLetter.recipient_designation) && (
                        <span> • Designation: <span className="font-semibold text-slate-800">{selectedViewLetter.employee_designation || selectedViewLetter.recipient_designation}</span></span>
                      )}
                    </p>
                  </div>

                  {/* Subject */}
                  <div className="font-bold text-slate-900 text-[10pt]">
                    Subject: <u className="underline decoration-[#146537] underline-offset-3">{selectedViewLetter.subject}</u>
                  </div>

                  {/* Salutation */}
                  <div className="font-semibold text-slate-800 text-[10pt]">
                    {selectedViewLetter.salutation ? selectedViewLetter.salutation.replace(/,+$/, '') + ',' : 'Dear Staff,'}
                  </div>

                  {/* Body Paragraphs */}
                  <div className="space-y-2 text-[10pt] leading-[1.6] text-justify text-slate-800">
                    {(selectedViewLetter.body_content || selectedViewLetter.body_text || '')
                      .split(/\n\s*\n/)
                      .map((p, idx) => (
                        <p key={idx} className="whitespace-pre-line">
                          {p}
                        </p>
                      ))}
                  </div>

                  {/* Monetary Penalty Box (if applicable) */}
                  {selectedViewLetter.penalty_amount && (
                    <div className="my-3 bg-[#fff1f2] border border-[#fecdd3] border-l-4 border-l-[#e11d48] px-3.5 py-2.5 rounded text-[9.5pt] text-[#9f1239]">
                      <div className="font-bold">
                        Monetary Penalty Ordered: ₹{Number(selectedViewLetter.penalty_amount).toLocaleString('en-IN')} {selectedViewLetter.penalty_amount_words ? `(${selectedViewLetter.penalty_amount_words})` : ''}
                      </div>
                      <div className="text-[8pt] text-[#4c0519] mt-0.5">
                        Recovery shall be processed through Accounts / Payroll as per hospital disciplinary regulations.
                      </div>
                    </div>
                  )}
                </div>

                {/* Sign-off & CC Block */}
                <div className="mt-6 pt-3 space-y-3.5">
                  {/* Closing Sign-off Section */}
                  <div className="border-t border-slate-200 pt-2.5 space-y-0.5">
                    <div className="font-bold text-slate-900 text-[9.5pt]">By Order of,</div>
                    <div className="font-semibold text-slate-800 text-[9pt]">Incident Management Committee & Executive Management</div>
                    <div className="text-[8.5pt] text-slate-500">Jaiprakash Hospital and Research Centre Pvt. Ltd.</div>

                    <div className="text-[8pt] text-slate-600 mt-1 leading-tight">
                      <div>Drafted by: <strong className="text-slate-800">{selectedViewLetter.drafted_by_name || 'Incident Management Committee Lead'}</strong></div>
                      {selectedViewLetter.approved_by_name && (
                        <div>Approved by: <strong className="text-slate-800">{selectedViewLetter.approved_by_name}</strong></div>
                      )}
                    </div>

                    {['approved', 'dispatched'].includes(selectedViewLetter.status) ? (
                      <div className="inline-block mt-2 bg-[#f0fdf4] border border-[#86efac] text-[#166534] px-2.5 py-1 rounded text-[7.5pt] font-semibold">
                        ✓ Digitally verified and approved via IMS on {formatDate(selectedViewLetter.approved_at || selectedViewLetter.letter_date)} • Ref: {selectedViewLetter.ref_number || selectedViewLetter.reference_number}
                      </div>
                    ) : (
                      <div className="inline-block mt-2 bg-amber-50 border border-amber-300 text-amber-800 px-2.5 py-1 rounded text-[7.5pt] font-semibold">
                        ⏳ Draft Directive — Pending Executive Management Approval
                      </div>
                    )}
                  </div>

                  {/* CC & QR Code Row */}
                  <div className="pt-2.5 border-t border-dashed border-slate-200 flex items-end justify-between gap-4 text-[8.5pt]">
                    <div className="flex-1 space-y-1 text-slate-600">
                      <div className="font-bold text-slate-700 uppercase tracking-wider text-[8pt]">
                        Copy Communicated for Information & Record To:
                      </div>
                      <ol className="list-decimal list-inside space-y-0.5 text-slate-600 text-[8pt]">
                        {(selectedViewLetter.cc_list || selectedViewLetter.cc_recipients || []).map((cc, i) => (
                          <li key={i}>{typeof cc === 'object' ? (cc.label || cc.name) : cc}</li>
                        ))}
                      </ol>
                    </div>

                    {/* QR Code */}
                    {(selectedViewLetter.qr_code_url || selectedViewLetter.qr_code_data) && (
                      <div className="shrink-0 text-center w-24">
                        <img
                          src={selectedViewLetter.qr_code_url || selectedViewLetter.qr_code_data}
                          alt="IMS QR Verification"
                          className="w-[76px] h-[76px] mx-auto border border-slate-300 rounded p-1 bg-white shadow-xs"
                        />
                        <div className="text-[6.8pt] text-slate-500 mt-1 leading-tight">
                          Scan to verify authentic incident dossier
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Section: Letterhead Footer (Anchored at page bottom) */}
              <div className="relative z-10 bg-white border-t border-slate-200 mt-auto">
                <div className="px-6 sm:px-[18mm] py-2 text-[7pt] text-slate-600 space-y-0.5">
                  <div className="flex items-center gap-3">
                    <span>📍 <strong>City Centre,</strong> Ambedkar Chowk, Uditnagar, Rourkela-769012</span>
                    <span>📞 : 7606000999 / 7682860043</span>
                    <span>✉️ : citycentre@jaiprakashhospitals.com</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>📍 <strong>City Centre,</strong> Main Road, Rajgangpur-770017</span>
                    <span>📞 : 9078884831 / 9078884832</span>
                    <span>✉️ : citycentre.rgp@jaiprakashhospitals.com</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-dotted border-slate-200 text-[7pt] font-semibold text-slate-500">
                    <span>Ref: {selectedViewLetter.ref_number || selectedViewLetter.reference_number}</span>
                    <span>Page 1 of 1 • Official Form: JPHRC/GNR/FRM/004A</span>
                  </div>
                </div>

                {/* Bottom Green Band with Lime Wedge */}
                <div className="relative w-full h-[11px] bg-[#146537] overflow-hidden">
                  <div className="absolute top-0 left-0 w-8 h-full bg-[#8DC63F] -skew-x-[35deg] -ml-2"></div>
                </div>
              </div>

            </div>
          </div>
        </Modal>
      )}

      {/* --- MANAGEMENT REJECT / REVISE MODAL --- */}
      {mgmtRejectModal && (
        <Modal
          open={mgmtRejectModal}
          onClose={() => setMgmtRejectModal(false)}
          title="Return Letters to IMC for Revision"
          size="md"
          footer={
            <>
              <button onClick={() => setMgmtRejectModal(false)} className="btn-secondary text-xs">
                Cancel
              </button>
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
            <Alert type="warning" message="This will return the incident back to the IMC with status 'pending_letter_generation'. Please provide revision instructions." />
            <div>
              <label className="field-label field-required text-xs">Revision Instructions / Notes</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="textarea text-xs"
                rows={4}
                placeholder="Specify required changes in wording, penalty amount, or recipient details..."
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
