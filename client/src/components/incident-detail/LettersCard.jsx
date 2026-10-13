import React, { useState } from 'react';
import { FileText, Send, CheckCircle, Clock, Trash2, Edit3, Printer, Eye, QrCode, AlertTriangle, Building, ShieldCheck, Mail } from 'lucide-react';
import { Modal, Spinner, Alert } from '../ui';
import { lettersApi } from '../../api';
import toast from 'react-hot-toast';

export default function LettersCard({
  incident,
  letters = [],
  user,
  canImcAct,
  isManagement,
  onOpenDraftModal,
  onEditDraft,
  onRefetch
}) {
  const [selectedViewLetter, setSelectedViewLetter] = useState(null);
  const [isSubmittingToMgmt, setIsSubmittingToMgmt] = useState(false);
  const [isMgmtDeciding, setIsMgmtDeciding] = useState(false);
  const [mgmtRejectModal, setMgmtRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const isImcLead = Boolean(user?.is_imc_lead || user?.isImcLead || user?.role === 'imc' || user?.is_system_admin || user?.role === 'system_admin');
  const isMgmtUser = Boolean(isManagement || user?.role === 'head_management' || user?.role === 'system_admin');

  const pendingDraftsCount = letters.filter(l => l.status === 'draft').length;
  const isPendingLetterGeneration = incident?.status === 'pending_letter_generation';
  const isPendingMgmtApproval = incident?.status === 'pending_management_letter_approval';

  const handleDeleteDraft = async (letterId) => {
    if (!window.confirm('Are you sure you want to delete this letter draft?')) return;
    try {
      await lettersApi.deleteDraft(incident.id, letterId);
      toast.success('Draft deleted.');
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete draft.');
    }
  };

  const handleSubmitToManagement = async () => {
    if (letters.length === 0) {
      toast.error('Please draft at least one letter before submitting to Management.');
      return;
    }
    setIsSubmittingToMgmt(true);
    try {
      await lettersApi.submitToManagement(incident.id);
      toast.success('Letter(s) submitted to Executive Management for approval.');
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit letters.');
    } finally {
      setIsSubmittingToMgmt(false);
    }
  };

  const handleManagementApproval = async () => {
    if (!window.confirm('Approve all drafted letters and dispatch them to the employees & CC recipients via email? This will officially CLOSE the incident.')) {
      return;
    }
    setIsMgmtDeciding(true);
    try {
      await lettersApi.managementDecision(incident.id, { decision: 'approve' });
      toast.success('Letters approved and dispatched successfully. Incident CLOSED.');
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
      await lettersApi.managementDecision(incident.id, { decision: 'reject', notes: rejectReason });
      toast.success('Letters returned to IMC for revision.');
      setMgmtRejectModal(false);
      setRejectReason('');
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

  if (!letters.length && !isPendingLetterGeneration && !isPendingMgmtApproval) {
    return null;
  }

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
              <h2 className="text-sm font-bold text-slate-800">Formal Communication Letters</h2>
              <p className="text-[11px] text-slate-500">
                Official disciplinary, advisory, and recommendation notices
              </p>
            </div>
          </div>

          {/* Action buttons on top right */}
          <div className="flex items-center gap-2">
            {isPendingLetterGeneration && isImcLead && (
              <button
                type="button"
                onClick={onOpenDraftModal}
                className="btn-primary btn-sm text-xs flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700"
              >
                <FileText size={13} /> Draft Letter
              </button>
            )}
          </div>
        </div>

        {/* Workflow Status Banner */}
        {isPendingLetterGeneration && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-amber-800">
                <Clock size={14} className="text-amber-600" /> Letter Drafting in Progress (IMC Level)
              </p>
              <p className="text-amber-700 text-[11px] leading-relaxed">
                Management has ordered formal disciplinary/advisory outcome. The IMC must draft letters for the involved employee(s) using standard templates and forward them to Management for dispatch.
              </p>
            </div>

            {isImcLead && letters.length > 0 && (
              <button
                type="button"
                onClick={handleSubmitToManagement}
                disabled={isSubmittingToMgmt}
                className="btn-primary btn-sm text-xs bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 whitespace-nowrap shadow-sm ml-auto"
              >
                {isSubmittingToMgmt ? <Spinner size={12} className="text-white" /> : <Send size={12} />}
                Submit {letters.length} Letter{letters.length === 1 ? '' : 's'} to Management
              </button>
            )}
          </div>
        )}

        {isPendingMgmtApproval && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-900 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold flex items-center gap-1.5 text-indigo-800 text-sm">
                  <ShieldCheck size={16} className="text-indigo-600" /> Awaiting Management Approval & Dispatch
                </p>
                <p className="text-indigo-700 text-[11px] mt-0.5 leading-relaxed">
                  The IMC has finalized {letters.length} formal letter(s). Upon Management approval, official letters with verified IMS QR codes will be dispatched to employee(s) and department leadership via email, and this incident will be marked <strong>CLOSED</strong>.
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
                  Approve & Dispatch Letters via Email (Close Incident)
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

        {/* Letters List */}
        {letters.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No formal letters drafted yet for this incident.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {letters.map(letter => {
              const isApproved = letter.status === 'approved';
              const isDraft = letter.status === 'draft';
              const isSubmitted = letter.status === 'submitted_to_management';

              return (
                <div
                  key={letter.id}
                  className="p-3.5 rounded-xl border bg-slate-50/70 border-slate-200 hover:border-indigo-200 hover:shadow-xs transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-[11px] font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {letter.ref_number || 'PENDING REF'}
                      </span>
                      <h4 className="text-xs font-bold text-slate-800 mt-1 truncate">
                        {letter.employee_name || 'Staff Member'}
                      </h4>
                      <p className="text-[10px] text-slate-500 truncate">
                        {[letter.employee_designation, letter.employee_department].filter(Boolean).join(' • ')}
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
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 line-clamp-2 bg-white p-2 rounded border border-slate-100">
                    <strong>Subject:</strong> {letter.subject}
                  </div>

                  {letter.penalty_amount && (
                    <div className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                      Monetary Penalty: ₹{letter.penalty_amount} {letter.penalty_amount_words ? `(${letter.penalty_amount_words})` : ''}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedViewLetter(letter)}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 text-[11px]"
                    >
                      <Eye size={12} /> View Official Letter
                    </button>

                    <div className="flex items-center gap-1">
                      {isDraft && isImcLead && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditDraft(letter)}
                            className="p-1 text-slate-500 hover:text-indigo-600 rounded"
                            title="Edit Letter Draft"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDraft(letter.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Delete Draft"
                          >
                            <Trash2 size={13} />
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

      {/* --- LETTERHEAD PRINT & VIEW MODAL --- */}
      {selectedViewLetter && (
        <Modal
          open={Boolean(selectedViewLetter)}
          onClose={() => setSelectedViewLetter(null)}
          title={`Official Letter: ${selectedViewLetter.ref_number || 'Draft'}`}
          size="2xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-slate-500">
                Status: {selectedViewLetter.status?.toUpperCase()}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="btn-primary text-xs flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900"
                >
                  <Printer size={14} /> Print Letterhead
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
          <div className="bg-white border-2 border-slate-300 rounded-xl p-8 font-serif text-slate-800 space-y-6 max-h-[70vh] overflow-y-auto print:border-none print:p-0">
            {/* Hospital Header */}
            <div className="border-b-2 border-slate-800 pb-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Building className="text-slate-800" size={24} />
                <h1 className="text-xl font-bold tracking-wide uppercase text-slate-900">
                  Jai Prakash Hospital & Research Centre
                </h1>
              </div>
              <p className="text-[11px] font-sans text-slate-600 tracking-wider uppercase font-semibold">
                Incident Management Committee (IMC) • Quality & Patient Safety Division
              </p>
              <p className="text-[10px] font-sans text-slate-500 mt-0.5">
                JPHRC Campus, Main Road • Phone: +91-1234-567890 • Email: imc@jphrc.org
              </p>
            </div>

            {/* Reference Number & Date */}
            <div className="flex items-center justify-between text-xs font-sans font-semibold text-slate-700 border-b border-slate-100 pb-2">
              <div>
                Ref. No: <span className="font-mono text-slate-900 font-bold">{selectedViewLetter.ref_number}</span>
              </div>
              <div>
                Date: <span className="text-slate-900">{selectedViewLetter.letter_date?.split('T')[0]}</span>
              </div>
            </div>

            {/* Recipient */}
            <div className="text-xs font-sans space-y-0.5 text-slate-800">
              <p className="font-bold">To,</p>
              <p className="font-bold text-sm text-slate-900">
                {selectedViewLetter.employee_name}
              </p>
              {selectedViewLetter.employee_code && (
                <p className="text-slate-600">
                  Employee ID: <span className="font-mono font-semibold">{selectedViewLetter.employee_code}</span>
                </p>
              )}
              <p className="text-slate-600">
                Designation: <span className="font-semibold">{selectedViewLetter.employee_designation || 'Staff'}</span>
              </p>
              <p className="text-slate-600">
                Department: <span className="font-semibold">{selectedViewLetter.employee_department}</span>
              </p>
              <p className="text-slate-600">Jai Prakash Hospital & Research Centre</p>
            </div>

            {/* Subject */}
            <div className="text-xs font-sans font-bold text-slate-900 border-l-4 border-slate-800 pl-3 py-1 bg-slate-50">
              Subject: <u>{selectedViewLetter.subject}</u>
            </div>

            {/* Incident Context */}
            <div className="text-[11px] font-sans bg-amber-50/70 border border-amber-200 rounded p-2 text-amber-900">
              <strong>Incident Reference:</strong> {incident?.reference_id} • Occurred on {incident?.incident_date}
            </div>

            {/* Body */}
            <div className="text-xs leading-relaxed text-slate-800 whitespace-pre-line font-serif space-y-3">
              {selectedViewLetter.body_content}
            </div>

            {/* Signatures */}
            <div className="pt-8 grid grid-cols-2 gap-4 text-xs font-sans">
              <div className="border-t border-slate-400 pt-2 text-left">
                <p className="font-bold text-slate-900">Incident Management Committee</p>
                <p className="text-[10px] text-slate-500">Convenor / Chairperson</p>
                <p className="text-[9px] text-slate-400">JPHRC Quality Assurance</p>
              </div>
              <div className="border-t border-slate-400 pt-2 text-right">
                <p className="font-bold text-slate-900">Executive Management</p>
                <p className="text-[10px] text-slate-500">Medical Superintendent / Director</p>
                <p className="text-[9px] text-slate-400">Jai Prakash Hospital & Research Centre</p>
              </div>
            </div>

            {/* Footer with CC and QR Code */}
            <div className="border-t-2 border-slate-200 pt-4 flex items-end justify-between gap-4 font-sans text-[10px]">
              <div className="space-y-1 text-slate-600 flex-1">
                <p className="font-bold text-slate-800 uppercase tracking-wider text-[9px]">
                  Copy forwarded for information and necessary action to:
                </p>
                <ol className="list-decimal list-inside space-y-0.5">
                  {(selectedViewLetter.cc_list || []).map((cc, i) => (
                    <li key={i}>{cc}</li>
                  ))}
                </ol>
              </div>

              {/* Dynamic QR Code */}
              <div className="shrink-0 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded p-2 text-[9px] text-slate-500 max-w-[220px]">
                {selectedViewLetter.qr_code_data ? (
                  <img
                    src={selectedViewLetter.qr_code_data}
                    alt="IMS Incident Verification QR"
                    className="w-12 h-12 shrink-0 border border-slate-300 rounded"
                  />
                ) : (
                  <QrCode size={36} className="text-slate-800 shrink-0" />
                )}
                <div className="leading-tight">
                  <span className="font-bold text-slate-800 block">IMS Verification QR</span>
                  Scan to authenticate official record on IMS portal
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
