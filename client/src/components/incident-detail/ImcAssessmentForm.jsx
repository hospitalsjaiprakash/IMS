import { MessageSquare, Shield, Users, CheckCircle, AlertTriangle, RotateCcw, Clock, Paperclip, FileText } from 'lucide-react';
import { Spinner } from '../ui';
import FileUploadArea from './FileUploadArea';
import InvestigatorPicker from './InvestigatorPicker';
import ProposedOutcomeMultiSelect from './ProposedOutcomeMultiSelect';
import ResponsibleEmployeePicker from './ResponsibleEmployeePicker';
import { formatDateTime, parseProposedOutcomes } from '../../utils/helpers';

const EMPLOYEE_OUTCOME_KEYWORDS = [
  'warning', 'advisory', 'suggestion', 'penalty', 'salary deduction',
  'suspension', 'transfer', 'demotion', 'termination', 'disciplinary',
  'training', 'counselling', 'education',
];

export default function ImcAssessmentForm({
  incident,
  isLead,
  isImcMember,
  canImcAct,
  hasInvestigatorsAssigned,
  isAssignedPrimary,
  isAssignedSecondary,
  canInvestigatorAct,
  canImcReviewInvestigator,
  latestInvReport,
  investigationAttachmentsList,
  onViewAttachment,
  imcMembers,
  // Investigation assignment / report state
  investigatorRequired,
  setInvestigatorRequired,
  primaryInvestigators,
  setPrimaryInvestigators,
  secondaryInvestigators,
  setSecondaryInvestigators,
  assignInvestigatorMutation,
  investigatorReportText,
  setInvestigatorReportText,
  investigatorAttachments,
  setInvestigatorAttachments,
  investigatorReportMutation,
  satisfactionDecision,
  setSatisfactionDecision,
  reinvestigateRemarks,
  setReinvestigateRemarks,
  reassignMode,
  setReassignMode,
  reassignPrimary,
  setReassignPrimary,
  reassignSecondary,
  setReassignSecondary,
  rejectInvestigatorReportMutation,
  // Direct IMC quality assessment state (isolated!)
  imcFeedbackText,
  setImcFeedbackText,
  imcAttachments,
  setImcAttachments,
  imcSeverity,
  setImcSeverity,
  imcProposedOutcome,
  setImcProposedOutcome,
  imcResponsibleEmployees,
  setImcResponsibleEmployees,
  onResponsibleEmployeesChange,
  imcFeedbackMutation,
}) {
  const pendingScopes =
    (incident?.pending_review_categories?.length ? incident.pending_review_categories : incident?.pending_hod_departments) || [];
  const pendingTooltip = !incident?.all_hod_feedback_submitted
    ? `Disabled: Awaiting feedback for ${pendingScopes.join(', ') || 'assigned reviewer scope'}`
    : '';

  const outcomeLower = (imcProposedOutcome || '').toLowerCase();
  const isEmpOutcome = EMPLOYEE_OUTCOME_KEYWORDS.some(k => outcomeLower.includes(k));
  const requiresSelectedEmployees =
    [
      'warning', 'advisory', 'suggestion', 'penalty', 'suspension',
      'transfer', 'demotion', 'termination', 'training', 'counselling',
    ].some(k => outcomeLower.includes(k)) &&
    imcResponsibleEmployees.length === 0 &&
    (!incident?.responsible_employees || incident.responsible_employees.length === 0);

  const handleProposedOutcomeChange = (newList) => {
    setImcProposedOutcome(newList.join(', '));
    if (imcResponsibleEmployees.length > 0 && newList.length > 0) {
      setImcResponsibleEmployees(prev =>
        prev.map(e => ({
          ...e,
          outcomes: e.outcomes && e.outcomes.length > 0 ? e.outcomes : [...newList],
          needs_training:
            e.needs_training || newList.some(o => o.toLowerCase().includes('training') || o.toLowerCase().includes('counselling')),
        }))
      );
    }
  };

  const renderEmployeeOutcomePicker = () => {
    if (!isEmpOutcome && imcResponsibleEmployees.length === 0) return null;
    return (
      <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2 animate-fade-in">
        <ResponsibleEmployeePicker
          label="Search & Select Responsible Employee(s) Involved & Outcomes"
          required
          selected={imcResponsibleEmployees}
          onChange={onResponsibleEmployeesChange}
          allowPerEmployeeOutcomes={true}
          defaultOutcomes={parseProposedOutcomes(imcProposedOutcome)}
          placeholder="Type hospital staff name or employee ID…"
        />
      </div>
    );
  };

  return (
    <>
      {/* 1. Investigation Panel Status */}
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
                <div key={inv.id || inv.investigator_id} className="p-3 rounded-xl border bg-white border-slate-200 shadow-2xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-800 truncate">{inv.full_name}</span>
                        {inv.employee_id && (
                          <span className="text-[11px] text-slate-500 font-mono">({inv.employee_id})</span>
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

      {/* 2. Centralized Joint Investigation Report Form */}
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
            As an assigned Primary Investigator, provide the unified findings and root-cause analysis agreed upon by the panel.
          </p>

          <div className="space-y-4">
            <div>
              <label className="field-label mb-1">
                Detailed Investigation Findings &amp; Explanation <span className="text-red-500">*</span>
              </label>
              <textarea
                value={investigatorReportText}
                onChange={e => setInvestigatorReportText(e.target.value)}
                placeholder="Provide a detailed explanation of the investigation findings, root cause analysis, sequence of events, and panel observations…"
                className="textarea"
                rows={5}
                required
              />
            </div>

            <FileUploadArea
              label="Supporting Attachments (Optional)"
              hint="Upload any on-site photographs, evidence, or supporting documents (max 2MB each)"
              files={investigatorAttachments}
              setFiles={setInvestigatorAttachments}
            />

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => investigatorReportMutation.mutate()}
                disabled={!investigatorReportText.trim() || investigatorReportMutation.isPending}
                className="btn-primary btn-sm flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {investigatorReportMutation.isPending && <Spinner size={12} />}
                Submit Joint Report to IMC Convenor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Review Investigator Report & Convenor Decision */}
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

          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Joint Investigation Findings
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

              {incident.investigators?.length > 0 && (
                <div className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Investigation Panel:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {incident.investigators.map(inv => {
                      const isPrimary = Boolean(inv.role === 'imc' || inv.is_imc_member || inv.is_imc_lead);
                      return (
                        <span key={inv.id || inv.investigator_id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px]">
                          <span className="font-semibold text-slate-700">{inv.full_name}</span>
                          {inv.employee_id && <span className="text-[10px] text-slate-400 font-mono">({inv.employee_id})</span>}
                          <span className={`text-[9px] font-bold px-1 rounded ${isPrimary ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
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
                  Investigation Findings &amp; Analysis:
                </p>
                <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {latestInvReport?.feedback_text || incident.investigators?.find(i => i.report_text)?.report_text || 'No report text provided.'}
                </p>
              </div>

              {investigationAttachmentsList.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Paperclip size={13} className="text-indigo-600" />
                    Attached Evidence &amp; Documents ({investigationAttachmentsList.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {investigationAttachmentsList.map(att => (
                      <button
                        type="button"
                        key={att.id}
                        onClick={() => onViewAttachment && onViewAttachment(att)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-700 transition-colors shadow-2xs"
                      >
                        <FileText size={13} className="text-indigo-600" />
                        <span className="truncate max-w-[200px]">{att.original_filename}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-4">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wide block">
              Are you satisfied with the investigation findings?
            </label>

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

            {satisfactionDecision === 'unsatisfied' ? (
              <div className="mt-4 pt-4 space-y-4 bg-amber-50/40 p-4 rounded-xl border border-amber-200">
                <div>
                  <label className="field-label mb-1">
                    Remarks &amp; Re-investigation Instructions <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={reinvestigateRemarks}
                    onChange={e => setReinvestigateRemarks(e.target.value)}
                    placeholder="Explain why the investigation is unsatisfactory and what additional points need review…"
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
                          ...reassignPrimary.map(p => p.employee_id),
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
                            feedbackText: reinvestigateRemarks,
                            investigatorIds: [
                              ...reassignPrimary.map(p => p.id || p.employee_id),
                              ...reassignSecondary.map(s => s.id || s.employee_id),
                            ],
                          });
                        } else {
                          rejectInvestigatorReportMutation.mutate({
                            action: 'reinvestigate',
                            feedbackText: reinvestigateRemarks,
                          });
                        }
                      }}
                      disabled={
                        !reinvestigateRemarks.trim() ||
                        (reassignMode && reassignPrimary.length === 0) ||
                        rejectInvestigatorReportMutation.isPending
                      }
                      className="btn-primary btn-sm bg-amber-600 hover:bg-amber-700 border-amber-600 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {rejectInvestigatorReportMutation.isPending ? <Spinner size={12} /> : <RotateCcw size={12} />}
                      {reassignMode ? 'Re-assign & Send for Re-investigation' : 'Send for Re-investigation (Same Team)'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 pt-4 space-y-4 bg-emerald-50/40 p-4 rounded-xl border border-emerald-200">
                <div>
                  <label className="field-label mb-1">
                    Final IMC Quality Assessment &amp; Findings <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={imcFeedbackText}
                    onChange={e => setImcFeedbackText(e.target.value)}
                    placeholder="Enter comprehensive IMC review, root cause findings, and quality observations to be forwarded to Management…"
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
                      <option value="">Select Severity…</option>
                      <option value="Minor">Minor</option>
                      <option value="Major">Major</option>
                      <option value="Grave">Grave</option>
                    </select>
                  </div>

                  <div>
                    <ProposedOutcomeMultiSelect
                      selected={parseProposedOutcomes(imcProposedOutcome)}
                      onChange={handleProposedOutcomeChange}
                      label="Proposed Outcome(s)"
                      required
                      placeholder="Select one or more proposed outcomes…"
                    />
                  </div>
                </div>

                {renderEmployeeOutcomePicker()}

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => imcFeedbackMutation.mutate(true)}
                    disabled={
                      !imcFeedbackText.trim() ||
                      !imcSeverity ||
                      (parseProposedOutcomes(imcProposedOutcome).length === 0 &&
                        imcResponsibleEmployees.every(e => (e.outcomes || []).length === 0)) ||
                      requiresSelectedEmployees ||
                      imcFeedbackMutation.isPending
                    }
                    className="btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700 border-emerald-600 disabled:opacity-50"
                  >
                    {imcFeedbackMutation.isPending && <Spinner size={12} />}
                    Submit Feedback Directly to Management
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Standard / Revised Quality Review (IMC) Form */}
      {canImcAct &&
        (incident.status === 'with_imc' ||
          (incident.status === 'with_hod_and_imc' && !incident.has_imc_feedback)) && (
          <div className="card p-5 border-indigo-200 bg-indigo-50/10 print:hidden space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="text-indigo-600" size={18} />
              <h2 className="text-sm font-semibold text-slate-800">
                {incident.has_imc_feedback ? 'Revised Quality Review (IMC)' : 'Quality Review (IMC)'}
              </h2>
            </div>
            {incident.has_imc_feedback && incident.management_notes && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
                <p className="font-bold text-amber-900">Executive Management Directive / Return Notes:</p>
                <p className="whitespace-pre-wrap leading-relaxed">{incident.management_notes}</p>
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
                        ...primaryInvestigators.map(p => p.employee_id),
                      ].filter(Boolean)}
                      placeholder="Type employee name or employee ID…"
                      accent="blue"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          assignInvestigatorMutation.mutate([
                            ...primaryInvestigators.map(p => p.id || p.employee_id),
                            ...secondaryInvestigators.map(s => s.id || s.employee_id),
                          ])
                        }
                        disabled={!incident.all_hod_feedback_submitted || primaryInvestigators.length === 0 || assignInvestigatorMutation.isPending}
                        title={
                          !incident.all_hod_feedback_submitted
                            ? pendingTooltip
                            : primaryInvestigators.length === 0
                              ? 'Select at least one primary investigator (IMC member)'
                              : ''
                        }
                        className="btn-primary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {assignInvestigatorMutation.isPending && <Spinner size={12} />}
                        Assign Investigator(s) ({primaryInvestigators.length + secondaryInvestigators.length})
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="field-label mb-1">Your Review &amp; Findings</label>
                      <textarea
                        value={imcFeedbackText}
                        onChange={e => setImcFeedbackText(e.target.value)}
                        placeholder="Enter quality assessment, root cause observation, or corrective action recommendations…"
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
                        <option value="">Select Severity…</option>
                        <option value="Minor">Minor</option>
                        <option value="Major">Major</option>
                        <option value="Grave">Grave</option>
                      </select>
                    </div>
                    <div>
                      <ProposedOutcomeMultiSelect
                        selected={parseProposedOutcomes(imcProposedOutcome)}
                        onChange={handleProposedOutcomeChange}
                        label="Proposed Outcome(s)"
                        required
                        placeholder="Select one or more proposed outcomes…"
                      />
                    </div>

                    {renderEmployeeOutcomePicker()}

                    <div className="flex justify-end gap-2 mt-4">
                      <button
                        type="button"
                        onClick={() => imcFeedbackMutation.mutate(true)}
                        disabled={
                          !incident.all_hod_feedback_submitted ||
                          !imcFeedbackText.trim() ||
                          !imcSeverity ||
                          (parseProposedOutcomes(imcProposedOutcome).length === 0 &&
                            imcResponsibleEmployees.every(e => (e.outcomes || []).length === 0)) ||
                          requiresSelectedEmployees ||
                          imcFeedbackMutation.isPending
                        }
                        className="btn-primary btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        title={pendingTooltip}
                      >
                        {imcFeedbackMutation.isPending && <Spinner size={12} />}
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
          </div>
        )}
    </>
  );
}
