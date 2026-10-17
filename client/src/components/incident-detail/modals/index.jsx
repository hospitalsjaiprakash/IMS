import React, { useState, useEffect, useMemo } from 'react';
import { Download, FileText, AlertCircle, Search, UserPlus, X, Shield, Users, CheckCircle, DollarSign } from 'lucide-react';
import { Modal, Spinner, Alert } from '../../../components/ui';
import { UPLOADS_URL, API_BASE_URL, attachmentsApi } from '../../../api';
import { OCCURRED_TO_OPTIONS, SEVERITY_OPTIONS, parseProposedOutcomes } from '../../../utils/helpers';
import FileUploadArea from '../FileUploadArea';
import ProposedOutcomeMultiSelect from '../ProposedOutcomeMultiSelect';
import ResponsibleEmployeePicker from '../ResponsibleEmployeePicker';

export function WithdrawModal({ show, onClose, withdrawReason, setWithdrawReason, mutate, isPending }) {
  return (
    <Modal open={show} onClose={onClose} title="Withdraw Incident" size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={mutate} disabled={!withdrawReason.trim() || isPending} className="btn-primary bg-red-600 hover:bg-red-700 border-red-600">
          {isPending && <Spinner size={15} className="text-white" />} Withdraw
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
  );
}

export function HodFeedbackModal({ show, onClose, feedbackText, setFeedbackText, hodAttachments, setHodAttachments, mutate, isPending, canHodFeedback }) {
  return (
    <Modal open={show} onClose={onClose} title="Submit Feedback" size="lg"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        {canHodFeedback && (
          <button
            onClick={mutate}
            disabled={!feedbackText.trim() || isPending}
            className="btn-primary"
          >
            {isPending && <Spinner size={15} className="text-white" />} Submit Feedback
          </button>
        )}
      </>}
    >
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
  );
}

function convertNumberToWords(amount) {
  if (!amount || isNaN(amount) || Number(amount) <= 0) return '';
  const num = Math.floor(Number(amount));
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const numToWordsUnder1000 = (n) => {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    } else if (n > 0) {
      str += ones[n];
    }
    return str.trim();
  };

  let words = '';
  const crore = Math.floor(num / 10000000);
  let rem = num % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem %= 100000;
  const thousand = Math.floor(rem / 1000);
  rem %= 1000;

  if (crore > 0) words += numToWordsUnder1000(crore) + ' Crore ';
  if (lakh > 0) words += numToWordsUnder1000(lakh) + ' Lakh ';
  if (thousand > 0) words += numToWordsUnder1000(thousand) + ' Thousand ';
  if (rem > 0) words += numToWordsUnder1000(rem);

  return `Rupees ${words.trim()} only`;
}

export function ManagementDecisionModal({
  show,
  onClose,
  mdActions,
  setMdActions,
  mdAttachments,
  setMdAttachments,
  mdProposedOutcome,
  setMdProposedOutcome,
  incidentProposedOutcome,
  responsibleEmployees = [],
  mdResponsibleEmployees = [],
  setMdResponsibleEmployees,
  penaltyAmount = '',
  setPenaltyAmount,
  mutate,
  isPending
}) {
  const [decision, setDecision] = useState('AGREE');

  useEffect(() => {
    if (!show) {
      setDecision('AGREE');
    } else {
      if (!mdProposedOutcome && incidentProposedOutcome) {
        setMdProposedOutcome(incidentProposedOutcome);
      }
      if (setMdResponsibleEmployees) {
        if (responsibleEmployees && responsibleEmployees.length > 0) {
          setMdResponsibleEmployees(JSON.parse(JSON.stringify(responsibleEmployees)));
        } else if (!mdResponsibleEmployees) {
          setMdResponsibleEmployees([]);
        }
      }
    }
  }, [show]);

  const effectiveOutcome = (decision === 'DISAGREE_MODIFY' ? mdProposedOutcome : incidentProposedOutcome) || '';
  const allCurrentOutcomes = [
    effectiveOutcome,
    ...(mdResponsibleEmployees || []).flatMap(e => e.outcomes || [])
  ].join(' ').toLowerCase();

  const employeesWithPenalty = useMemo(() => {
    return (mdResponsibleEmployees || []).filter(e =>
      (e.outcomes || []).some(o => o.toLowerCase().includes('penalty'))
    );
  }, [mdResponsibleEmployees]);

  const hasEmployeePenalties = employeesWithPenalty.length > 0;
  const totalEmployeePenalty = useMemo(() => {
    return employeesWithPenalty.reduce((sum, e) => sum + (Number(e.penalty_amount) || 0), 0);
  }, [employeesWithPenalty]);

  // Keep penaltyAmount synchronized with employee penalties when specified
  useEffect(() => {
    if (decision === 'DISAGREE_MODIFY' && hasEmployeePenalties) {
      if (setPenaltyAmount && Number(penaltyAmount) !== totalEmployeePenalty) {
        setPenaltyAmount(totalEmployeePenalty > 0 ? String(totalEmployeePenalty) : '');
      }
    }
  }, [decision, hasEmployeePenalties, totalEmployeePenalty]);

  const isPenaltyOutcome = allCurrentOutcomes.includes('penalty') || allCurrentOutcomes.includes('deduction');
  const isLetterOutcome = [
    'warning', 'advisory', 'suggestion', 'penalty', 'salary deduction',
    'suspension', 'transfer', 'demotion', 'termination', 'disciplinary'
  ].some(k => allCurrentOutcomes.includes(k));
  const isTrainingOutcome = ['training', 'counselling', 'education', 'mishandling'].some(k => allCurrentOutcomes.includes(k));
  const isDirectClosure = !isLetterOutcome && !isTrainingOutcome;

  const penaltyWordsPreview = convertNumberToWords(hasEmployeePenalties ? totalEmployeePenalty : penaltyAmount);

  return (
    <Modal open={show} onClose={onClose} title="Executive Management Decision & Governance" size="lg"
      footer={<>
        <button onClick={onClose} className="btn-secondary text-xs">Cancel</button>
        <button
          onClick={() => mutate(decision)}
          disabled={
            isPending ||
            (['DISAGREE_REINVESTIGATE', 'DISAGREE_REVISE_FEEDBACK'].includes(decision)
              ? !mdActions?.trim()
              : (decision === 'DISAGREE_MODIFY' && parseProposedOutcomes(mdProposedOutcome).length === 0))
          }
          className="btn-primary text-xs"
        >
          {isPending && <Spinner size={14} className="text-white" />} Submit Decision
        </button>
      </>}
    >
      <div className="space-y-4">
        <div>
          <label className="field-label field-required text-xs">Management Decision</label>
          <select value={decision} onChange={e => setDecision(e.target.value)} className="select w-full text-xs">
            <option value="AGREE">Approve / Agree with IMC Recommendation</option>
            <option value="DISAGREE_MODIFY">Modify Proposed Outcomes / Responsible Employees</option>
            <option value="DISAGREE_REINVESTIGATE">Reject & Mandate Re-investigation</option>
            <option value="DISAGREE_REVISE_FEEDBACK">Reject & Request Revised Quality Feedback</option>
          </select>
        </div>

        {decision === 'AGREE' && (() => {
          const imcOutcomesList = parseProposedOutcomes(incidentProposedOutcome);
          const isNoAction = imcOutcomesList.length === 0 || imcOutcomesList.some(o => o.toLowerCase() === 'no action');
          const hasStaff = responsibleEmployees && responsibleEmployees.length > 0;

          if (isNoAction) {
            return (
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5 animate-fade-in">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                  <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                  <span>IMC Recommendation: No Action</span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  The Incident Management Committee reviewed the incident and proposed <strong>No Action</strong>. Agreeing will conclude and officially close this incident without disciplinary actions or personnel mandates.
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-3 animate-fade-in">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Agreed IMC Recommended Outcome(s)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {imcOutcomesList.length > 0 ? (
                    imcOutcomesList.map((out, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                      >
                        {out}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500 italic">No specific outcome recorded</span>
                  )}
                </div>
              </div>

              {hasStaff && (
                <div className="p-3 bg-slate-50/80 border border-slate-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Personnel & Assigned Outcomes ({responsibleEmployees.length})
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Agreed with IMC recommendations. To adjust personnel or change outcomes, select &quot;Modify Proposed Outcomes&quot; above.
                      </p>
                    </div>
                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full shrink-0">
                      {responsibleEmployees.length} staff
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {responsibleEmployees.map((emp) => {
                      const empCode = emp.emp_id || emp.employee_code || emp.employee_no || (emp.employee_id && emp.employee_id.length < 20 ? emp.employee_id : '') || '';
                      const empOutcomes = Array.isArray(emp.outcomes) && emp.outcomes.length > 0 ? emp.outcomes : imcOutcomesList;
                      return (
                        <div
                          key={emp.id || emp.employee_id}
                          className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between gap-3 text-xs shadow-2xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 flex items-center gap-1.5 truncate">
                              <span>{emp.full_name || emp.name}</span>
                              {empCode && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                                  {empCode}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {[emp.designation, emp.department || emp.department_name].filter(Boolean).join(' • ')}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1 items-center justify-end shrink-0">
                            {empOutcomes.map((out, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                              >
                                {out}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {(decision === 'DISAGREE_REINVESTIGATE' || decision === 'DISAGREE_REVISE_FEEDBACK') ? (
          <div>
            <label className="field-label field-required text-xs">{decision === 'DISAGREE_REINVESTIGATE' ? 'Re-investigation' : 'Revision'} Notes / Directive</label>
            <textarea value={mdActions} onChange={e => setMdActions(e.target.value)} className="textarea text-xs" rows={4} placeholder="Describe specific aspects requiring reinvestigation or clarification..." />
          </div>
        ) : (
          <>
            {decision === 'DISAGREE_MODIFY' && (
              <div className="space-y-3 p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl">
                {/* If employees are already selected, show a concise aggregated tag summary instead of a duplicate multiselect box */}
                {mdResponsibleEmployees && mdResponsibleEmployees.length > 0 ? (
                  <div className="p-2.5 bg-white rounded-lg border border-indigo-200 text-xs flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 block mb-1">
                        Aggregated Disciplinary Directives ({parseProposedOutcomes(mdProposedOutcome).length})
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {parseProposedOutcomes(mdProposedOutcome).map(o => (
                          <span key={o} className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {o}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 italic">
                      Directives assigned individually on employee cards below
                    </span>
                  </div>
                ) : (
                  <ProposedOutcomeMultiSelect
                    selected={parseProposedOutcomes(mdProposedOutcome)}
                    onChange={(newList) => {
                      setMdProposedOutcome(newList.join(', '));
                    }}
                    label="Modified Proposed Outcome(s)"
                    required
                    placeholder="Select one or more modified outcomes..."
                  />
                )}

                <ResponsibleEmployeePicker
                  selected={mdResponsibleEmployees || []}
                  onChange={(newEmps) => {
                    if (setMdResponsibleEmployees) {
                      setMdResponsibleEmployees(newEmps);
                      if (newEmps && newEmps.length > 0) {
                        const allOutcomes = new Set();
                        const currentList = parseProposedOutcomes(mdProposedOutcome);
                        currentList.forEach(o => {
                          if (['No Action', 'New Protocol and Process Flow', 'Modifying Protocol and Process Flow', 'Inappropriate Complaint', 'Others'].includes(o)) {
                            allOutcomes.add(o);
                          }
                        });
                        newEmps.forEach(emp => {
                          (emp.outcomes || []).forEach(o => allOutcomes.add(o));
                        });
                        if (allOutcomes.size > 0) {
                          setMdProposedOutcome(Array.from(allOutcomes).join(', '));
                        }
                      }
                    }
                  }}
                  allowPerEmployeeOutcomes={true}
                  canSpecifyPenalty={true}
                  defaultOutcomes={parseProposedOutcomes(mdProposedOutcome)}
                  label="Modify Responsible / Involved Employee(s)"
                />
              </div>
            )}

            {/* Financial Penalty Display / Input - Avoids duplication when employee penalties are set */}
            {isPenaltyOutcome && (
              hasEmployeePenalties ? (
                <div className="p-2.5 bg-rose-50/70 border border-rose-200 rounded-xl flex items-center justify-between text-xs animate-fade-in">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                      <DollarSign size={14} />
                    </div>
                    <div>
                      <div className="font-bold text-rose-950">
                        Disciplinary Penalty Deductions: ₹{totalEmployeePenalty.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[11px] text-rose-700 italic">
                        {totalEmployeePenalty > 0 ? penaltyWordsPreview : 'Enter deduction amounts on employee card(s) above'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold bg-rose-100 text-rose-800 px-2 py-0.5 rounded shrink-0">
                    Allocated across {employeesWithPenalty.length} staff
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <label className="field-label field-required text-xs text-rose-900 font-bold mb-0">
                      Penalty Deduction Amount (₹)
                    </label>
                    <span className="text-[10px] text-rose-700 font-semibold bg-rose-100 px-2 py-0.5 rounded">
                      Management Discretion
                    </span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={penaltyAmount}
                    onChange={e => setPenaltyAmount && setPenaltyAmount(e.target.value)}
                    placeholder="Enter amount in Rupees (e.g. 1000)..."
                    className="input text-xs font-bold"
                  />
                  {penaltyWordsPreview && (
                    <p className="text-xs font-semibold text-rose-800 italic">
                      Amount in words: {penaltyWordsPreview}
                    </p>
                  )}
                </div>
              )
            )}

            {/* Streamlined Workflow Pipeline Indicator */}
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs flex-wrap gap-2">
              <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">Next Workflow Pipeline:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {isDirectClosure && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle size={12} /> Path A: Direct Case Closure
                  </span>
                )}
                {isLetterOutcome && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    <FileText size={12} /> Path B: Official Notice Letters
                  </span>
                )}
                {isTrainingOutcome && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <AlertCircle size={12} /> Path C: Mandatory Retraining
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="field-label text-xs">Corrective Actions / Management Directive Notes (Optional)</label>
              <textarea
                value={mdActions}
                onChange={e => setMdActions(e.target.value)}
                className="textarea text-xs"
                rows={3}
                placeholder="State executive directive, administrative instructions, or institutional corrective measures…"
              />
            </div>
            
            <FileUploadArea files={mdAttachments} setFiles={setMdAttachments} />
          </>
        )}
      </div>
    </Modal>
  );
}

export function ReopenModal({ show, onClose, reopenReason, setReopenReason, mutate, isPending }) {
  return (
    <Modal open={show} onClose={onClose} title="Reopen Incident"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={mutate} disabled={!reopenReason.trim() || isPending} className="btn-primary">
          {isPending && <Spinner size={15} className="text-white" />} Confirm Reopen
        </button>
      </>}
    >
      <div className="space-y-4">
        <Alert type="warning" message="Reopening this incident will send it back to the IMC queue." />
        <div>
          <label className="field-label field-required">Reason for Reopening</label>
          <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} className="textarea" rows={3} placeholder="Provide a reason..." />
        </div>
      </div>
    </Modal>
  );
}

export function ImcReportModal({ show, onClose, attachments, setAttachments, mutate, isPending }) {
  return (
    <Modal open={show} onClose={onClose} title="Generate Official IMC Report"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={mutate} disabled={isPending} className="btn-primary">
          {isPending && <Spinner size={15} className="text-white" />} Generate Report
        </button>
      </>}
    >
      <div className="space-y-4">
        <Alert type="info" message="Upload the official IMC report document (PDF recommended) based on the Management's decision." />
        
        <FileUploadArea files={attachments} setFiles={setAttachments} />
      </div>
    </Modal>
  );
}

export function RedirectIncidentModal({ show, onClose, redirectReason, setRedirectReason, mutate, isPending }) {
  return (
    <Modal open={show} onClose={onClose} title="Request Redirection to IMC"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={mutate}
          disabled={!redirectReason.trim() || isPending}
          className="btn-danger bg-orange-600 hover:bg-orange-700 border-orange-600 focus:ring-orange-500"
        >
          {isPending && <Spinner size={15} className="text-white" />} Request Redirection
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
  );
}

export function RejectRedirectModal({ show, onClose, rejectRedirectReason, setRejectRedirectReason, mutate, isPending }) {
  return (
    <Modal open={show} onClose={onClose} title="Reject Redirection Request"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={mutate}
          disabled={!rejectRedirectReason.trim() || isPending}
          className="btn-danger focus:ring-red-500"
        >
          {isPending && <Spinner size={15} className="text-white" />} Reject Request
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
  );
}

export function EditFeedbackModal({ editFbModal, onClose, editFbText, setEditFbText, mutate, isPending }) {
  return (
    <Modal
      open={!!editFbModal}
      onClose={onClose}
      title={editFbModal ? `Edit ${editFbModal.feedbackType.replace('head_management', 'Management').replace('hod', 'HOD').replace('imc', 'IMC').toUpperCase()} Feedback` : ''}
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            disabled={isPending || !editFbText.trim()}
            onClick={() => mutate({ feedbackType: editFbModal.feedbackType, feedbackText: editFbText, feedbackId: editFbModal.feedbackId })}
            className="btn-primary disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      {editFbModal && (
        <div className="space-y-4 pt-1">
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700">
              You are editing your own <strong>{editFbModal.feedbackType.replace('head_management', 'Management').replace('hod', 'HOD').replace('imc', 'IMC')}</strong> feedback.
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
  );
}

export function EditIncidentModal({ show, onClose, editInc, setEditInc, mutate, isPending }) {
  const handleSave = () => {
    if (editInc.incidentDate) {
      const parts = editInc.incidentDate.split('-').map(Number);
      const incDate = new Date(parts[0], parts[1] - 1, parts[2]);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const minAllowed = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14, 0, 0, 0, 0);

      if (incDate > today) {
        toast.error('Incident date cannot be in the future.');
        return;
      }
      if (incDate < minAllowed) {
        toast.error('Incidents must be reported within 14 days of occurrence.');
        return;
      }
    }
    mutate(editInc);
  };

  return (
    <Modal
      open={show}
      onClose={onClose}
      title="Edit Incident"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            disabled={isPending || !editInc.description?.trim()}
            onClick={handleSave}
            className="btn-primary disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Save Changes'}
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
              min={(() => {
                const d = new Date();
                d.setDate(d.getDate() - 14);
                return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
              })()}
              max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]}
              onChange={e => setEditInc(p => ({ ...p, incidentDate: e.target.value }))}
              className="input"
            />
            <p className="text-xs text-slate-500 mt-1">Must be within the past 14 days.</p>
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
  );
}

export function FilePreviewModal({ previewFile, onClose }) {
  const [fileUrl, setFileUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!previewFile) {
      setFileUrl(null);
      setLoading(false);
      setError(false);
      return;
    }

    if (previewFile instanceof File || previewFile instanceof Blob) {
      const objUrl = URL.createObjectURL(previewFile);
      setFileUrl(objUrl);
      return () => URL.revokeObjectURL(objUrl);
    }

    if (previewFile.url) {
      setFileUrl(previewFile.url);
      return;
    }

    if (previewFile.id) {
      setLoading(true);
      setError(false);
      attachmentsApi.getPreviewUrl(previewFile.id)
        .then(res => {
          if (res.data?.url) {
            setFileUrl(res.data.url);
          } else {
            setFileUrl(`${API_BASE_URL}/attachments/${previewFile.id}/view`);
          }
        })
        .catch(() => {
          setFileUrl(`${API_BASE_URL}/attachments/${previewFile.id}/view`);
        })
        .finally(() => setLoading(false));
    } else if (previewFile.stored_filename) {
      setFileUrl(`${UPLOADS_URL}/${previewFile.stored_filename?.split('/').map(encodeURIComponent).join('/')}`);
    }
  }, [previewFile]);

  const filename = previewFile?.original_filename || previewFile?.name || 'File Preview';
  const isImage = previewFile?.mime_type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)($|\?)/i.test(filename) || /\.(jpe?g|png|gif|webp|bmp|svg)($|\?)/i.test(fileUrl || '');
  const isPdf = previewFile?.mime_type === 'application/pdf' || /\.pdf($|\?)/i.test(filename) || /\.pdf($|\?)/i.test(fileUrl || '');

  const handleDownload = async () => {
    if (!previewFile) return;
    if (previewFile instanceof File || previewFile instanceof Blob) {
      const url = URL.createObjectURL(previewFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    if (previewFile.id) {
      try {
        const res = await attachmentsApi.getDownloadUrl(previewFile.id);
        if (res.data?.url) {
          window.open(res.data.url, '_blank');
          return;
        }
      } catch (_) {}
    }
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };

  return (
    <Modal
      open={!!previewFile}
      onClose={onClose}
      title={filename}
      size="full"
      footer={
        <div className="flex justify-between w-full">
          {previewFile ? (
            <button
              onClick={handleDownload}
              className="btn-primary flex items-center gap-2"
            >
              <Download size={16} /> Download
            </button>
          ) : <div />}
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      }
    >
      {previewFile && (
        <div className="flex items-center justify-center bg-slate-900 rounded-xl overflow-hidden min-h-[50vh] max-h-[80vh] p-2 relative">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-slate-300">
              <Spinner size={32} />
              <p className="text-sm">Loading attachment preview...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center bg-white rounded-xl w-full flex flex-col items-center justify-center">
              <FileText size={48} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-700 font-medium mb-1">Failed to load preview</p>
              <p className="text-xs text-slate-500 mb-4">You can download the file directly to view it.</p>
              <button onClick={handleDownload} className="btn-primary">Download File</button>
            </div>
          ) : isImage && fileUrl ? (
            <img
              src={fileUrl}
              alt="Preview"
              onError={() => setError(true)}
              className="max-w-full max-h-[78vh] object-contain rounded-lg shadow-sm"
            />
          ) : isPdf && fileUrl ? (
            <iframe src={fileUrl} className="w-full h-[78vh] rounded-lg" title="PDF Preview" />
          ) : (
            <div className="p-8 text-center bg-white rounded-xl w-full flex flex-col items-center justify-center">
              <FileText size={48} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium mb-2">Preview not available for this file format</p>
              <button onClick={handleDownload} className="btn-primary inline-flex mt-2">
                Download File
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function InvolveDepartmentModal({ show, onClose, currentDepartments = [], departmentsList = [], mutate, isPending }) {
  const [selectedDeptIds, setSelectedDeptIds] = useState([]);

  useEffect(() => {
    if (!show) setSelectedDeptIds([]);
  }, [show]);

  const currentNames = currentDepartments.map(d => (typeof d === 'string' ? d : d.name).toLowerCase());
  const availableDepts = departmentsList.filter(d => !currentNames.includes((d.name || '').toLowerCase()));

  const toggleDept = (id) => {
    setSelectedDeptIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <Modal open={show} onClose={onClose} title="Involve Additional Department(s)" size="md"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={() => mutate(selectedDeptIds)}
          disabled={selectedDeptIds.length === 0 || isPending}
          className="btn-primary"
        >
          {isPending && <Spinner size={15} className="text-white" />} Involve Selected ({selectedDeptIds.length})
        </button>
      </>}
    >
      <div className="space-y-4">
        <Alert type="info" message="Select one or more departments whose feedback is also required for this incident. Their HODs will be notified immediately." />

        <div className="text-xs text-slate-500 font-medium">
          Currently involved: <span className="text-slate-800 font-semibold">{currentDepartments.map(d => typeof d === 'string' ? d : d.name).join(', ') || 'None'}</span>
        </div>

        <div>
          <label className="field-label mb-2">Available Departments to Add</label>
          {availableDepts.length === 0 ? (
            <p className="text-sm text-slate-500 py-3">All hospital departments are already involved.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {availableDepts.map(d => (
                <label key={d.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedDeptIds.includes(d.id)}
                    onChange={() => toggleDept(d.id)}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-800">{d.name}</div>
                    {d.hod_name && <div className="text-xs text-slate-500">HOD: {d.hod_name}</div>}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

