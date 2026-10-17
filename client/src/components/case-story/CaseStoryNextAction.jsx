import React from 'react';
import {
  getStatusLabel,
  getStatusClass,
  formatDate,
  formatDateTime
} from '../../utils/helpers';
import LettersCard from '../incident-detail/LettersCard';
import TrainingProgressCard from '../incident-detail/TrainingProgressCard';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  Shield,
  ShieldCheck,
  Building,
  UserCheck,
  Award,
  Sparkles,
  Mail,
  GraduationCap,
  RotateCcw,
  FileText,
  Lock
} from 'lucide-react';

export default function CaseStoryNextAction({
  incident,
  user,
  feedbacks = [],
  letters = [],
  trainers = [],
  finalReport,
  canHodFeedback,
  canImcAct,
  isManagement,
  isAssignedInvestigator,
  isAssignedTrainer,
  onOpenHodFeedbackModal,
  onOpenRedirectModal,
  onOpenMdModal,
  onOpenReopenModal,
  onOpenImcReportModal,
  onOpenDraftModal,
  onDraftForEmployee,
  onEditDraft,
  onOpenAssignTrainerModal,
  onOpenTrainerReportModal,
  onRefetch
}) {
  const status = incident?.status || 'submitted';
  const role = user?.role;

  return (
    <div id="next-action-card" className="space-y-4 pt-2">
      {/* ── LETTERS MANAGEMENT SECTION (IF RELEVANT STATUS OR LETTERS EXIST) ── */}
      {(letters.length > 0 || ['pending_letter_generation', 'pending_management_letter_approval'].includes(status)) && (
        <LettersCard
          incident={incident}
          letters={letters}
          user={user}
          canImcAct={canImcAct}
          isManagement={isManagement}
          onOpenDraftModal={onOpenDraftModal}
          onDraftForEmployee={onDraftForEmployee}
          onEditDraft={onEditDraft}
          onRefetch={onRefetch}
        />
      )}

      {/* ── TRAINING MANAGEMENT SECTION (IF RELEVANT STATUS OR TRAINERS EXIST) ── */}
      {(trainers.length > 0 || ['pending_trainer_assignment', 'training_in_progress', 'pending_imc_training_review', 'pending_training'].includes(status) || incident?.needs_training) && (
        <TrainingProgressCard
          incident={incident}
          trainers={trainers}
          user={user}
          canImcAct={canImcAct}
          isManagement={isManagement}
          onOpenAssignModal={onOpenAssignTrainerModal}
          onOpenReportModal={onOpenTrainerReportModal}
          onRefetch={onRefetch}
        />
      )}

      {/* ── CONSOLIDATED NEXT ACTION CARD ── */}
      <div className="bg-white rounded-2xl border-2 border-indigo-200/90 shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles size={20} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">
                Workflow Action Required
              </span>
              <h3 className="text-base font-bold text-slate-900">
                {getActionTitle(status, canHodFeedback, canImcAct, isManagement, isAssignedInvestigator, isAssignedTrainer)}
              </h3>
            </div>
          </div>

          <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusClass(status)}`}>
            Current Stage: {getStatusLabel(status)}
          </span>
        </div>

        {/* DYNAMIC ACTION CONTENT BY STATUS & ROLE */}
        {renderActionContent({
          incident,
          user,
          status,
          role,
          canHodFeedback,
          canImcAct,
          isManagement,
          isAssignedInvestigator,
          isAssignedTrainer,
          onOpenHodFeedbackModal,
          onOpenRedirectModal,
          onOpenMdModal,
          onOpenReopenModal,
          onOpenImcReportModal,
          onOpenDraftModal,
          onOpenAssignTrainerModal,
          onOpenTrainerReportModal
        })}
      </div>
    </div>
  );
}

function getActionTitle(status, canHodFeedback, canImcAct, isManagement, isAssignedInvestigator, isAssignedTrainer) {
  if (['closed', 'resolved'].includes(status)) {
    return 'Hospital Incident Concluded';
  }
  if (['with_hod', 'with_hod_and_imc', 'redirect_requested'].includes(status)) {
    return canHodFeedback ? 'Head of Department (HOD) Feedback Required' : 'Awaiting Department Review';
  }
  if (status === 'with_investigator') {
    return isAssignedInvestigator ? 'Investigation Findings Submission Required' : 'Formal Investigation In Progress';
  }
  if (status === 'with_imc' || status === 'with_imc_review') {
    return canImcAct ? 'IMC Committee Assessment & Recommendation' : 'Awaiting Quality Committee Evaluation';
  }
  if (status === 'with_head_management') {
    return isManagement ? 'Executive Management Review & Final Directive' : 'Awaiting Management Governance Decision';
  }
  if (status === 'pending_letter_generation') {
    return canImcAct ? 'Draft Disciplinary / Communication Letters' : 'IMC Drafting Official Notices';
  }
  if (status === 'pending_management_letter_approval') {
    return isManagement ? 'Review & Authorize Letters for Dispatch' : 'Awaiting Management Dispatch Approval';
  }
  if (status === 'pending_trainer_assignment') {
    return canImcAct ? 'Appoint Designated Staff Trainer' : 'IMC Appointing Trainer';
  }
  if (status === 'training_in_progress') {
    return isAssignedTrainer ? 'Submit Training Report & Attendance Sheet' : 'Training Session in Progress';
  }
  if (status === 'pending_imc_training_review') {
    return canImcAct ? 'Verify Training Completion & Endorse' : 'IMC Verifying Training Report';
  }
  if (status === 'pending_imc_report') {
    return canImcAct ? 'Generate Final Incident Closure Report' : 'Awaiting Final Report Generation';
  }
  return 'Active Incident Under Review';
}

function renderActionContent({
  incident,
  user,
  status,
  role,
  canHodFeedback,
  canImcAct,
  isManagement,
  isAssignedInvestigator,
  isAssignedTrainer,
  onOpenHodFeedbackModal,
  onOpenRedirectModal,
  onOpenMdModal,
  onOpenReopenModal,
  onOpenImcReportModal,
  onOpenDraftModal,
  onOpenAssignTrainerModal,
  onOpenTrainerReportModal
}) {
  // 1. INCIDENT CLOSED
  if (['closed', 'resolved'].includes(status)) {
    return (
      <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
          <CheckCircle2 size={18} className="text-emerald-600" />
          <span>All hospital review stages, investigations, and CAPA protocols are fully completed.</span>
        </div>
        <p className="text-xs text-emerald-800 leading-relaxed">
          This case is officially archived. You can review the full chronological trail above or download all linked evidence and notices.
        </p>

        {(isManagement || canImcAct) && (
          <div className="pt-2 border-t border-emerald-200 flex justify-end">
            <button
              type="button"
              onClick={onOpenReopenModal}
              className="btn-secondary btn-sm text-xs text-rose-700 hover:text-rose-800 hover:bg-rose-50 border-rose-200 flex items-center gap-1.5"
            >
              <RotateCcw size={13} />
              <span>Reopen Incident for Exceptional Review</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // 2. HOD FEEDBACK PENDING
  if (['with_hod', 'with_hod_and_imc', 'redirect_requested'].includes(status)) {
    if (canHodFeedback) {
      return (
        <div className="space-y-3 bg-amber-50/50 border border-amber-200 p-4 rounded-xl">
          <p className="text-xs text-amber-900 leading-relaxed font-medium">
            You are authorized to review this incident and provide official department observations, root cause evaluation, and preventive recommendations.
          </p>
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              type="button"
              onClick={onOpenHodFeedbackModal}
              className="btn-primary btn-sm bg-teal-600 hover:bg-teal-700 border-teal-600 flex items-center gap-1.5"
            >
              <Building size={14} />
              <span>Submit Department Feedback</span>
            </button>

            <button
              type="button"
              onClick={onOpenRedirectModal}
              className="btn-secondary btn-sm text-xs text-orange-700 hover:bg-orange-50 border-orange-200 flex items-center gap-1.5"
            >
              <ArrowRight size={14} />
              <span>Request Department Redirection</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // 3. INVESTIGATOR PENDING
  if (status === 'with_investigator') {
    if (isAssignedInvestigator || canImcAct) {
      return (
        <div className="space-y-3 bg-cyan-50/50 border border-cyan-200 p-4 rounded-xl">
          <p className="text-xs text-cyan-950 leading-relaxed font-medium">
            The assigned investigation team must conduct fact-finding and submit a comprehensive joint report before the case can advance to IMC assessment.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('step2-card') || document.getElementById('next-action-card');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="btn-primary btn-sm bg-cyan-600 hover:bg-cyan-700 border-cyan-600 flex items-center gap-1.5"
            >
              <ShieldCheck size={14} />
              <span>Access Investigation Submission Panel</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // 4. IMC ASSESSMENT PENDING
  if (status === 'with_imc' || status === 'with_imc_review') {
    if (canImcAct) {
      return (
        <div className="space-y-3 bg-indigo-50/50 border border-indigo-200 p-4 rounded-xl">
          <p className="text-xs text-indigo-950 leading-relaxed font-medium">
            IMC Convenor evaluation is active. Review all department feedback and investigation findings, assign severity, select proposed outcomes, identify responsible staff, and forward to Management.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('step3-card') || document.getElementById('next-action-card');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="btn-primary btn-sm bg-indigo-600 hover:bg-indigo-700 border-indigo-600 flex items-center gap-1.5"
            >
              <Award size={14} />
              <span>Complete IMC Assessment & Recommendation</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // 5. MANAGEMENT DIRECTIVE PENDING
  if (status === 'with_head_management') {
    if (isManagement) {
      return (
        <div className="space-y-3 bg-purple-50/60 border border-purple-200 p-4 rounded-xl">
          <p className="text-xs text-purple-950 leading-relaxed font-medium">
            IMC has submitted their quality assessment and recommendations. As Executive Management, you may agree with the proposed outcome, modify the directive (e.g. mandate training, disciplinary penalty), or return for re-investigation.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenMdModal}
              className="btn-primary btn-sm bg-purple-700 hover:bg-purple-800 border-purple-700 flex items-center gap-1.5 shadow-xs"
            >
              <Sparkles size={14} />
              <span>Issue Executive Management Directive</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // 6. FORMAL LETTERS DRAFTING PENDING
  if (status === 'pending_letter_generation') {
    if (canImcAct) {
      return (
        <div className="space-y-3 bg-indigo-50/50 border border-indigo-200 p-4 rounded-xl">
          <p className="text-xs text-indigo-950 leading-relaxed font-medium">
            Management has mandated formal communication notices. Draft the appropriate letters for each responsible staff member and submit them to Management for dispatch authorization.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenDraftModal}
              className="btn-primary btn-sm bg-indigo-600 hover:bg-indigo-700 border-indigo-600 flex items-center gap-1.5"
            >
              <Mail size={14} />
              <span>Draft Official Letter</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // 7. TRAINER ASSIGNMENT PENDING
  if (status === 'pending_trainer_assignment') {
    if (canImcAct) {
      return (
        <div className="space-y-3 bg-blue-50/50 border border-blue-200 p-4 rounded-xl">
          <p className="text-xs text-blue-950 leading-relaxed font-medium">
            Management has mandated corrective training. Appoint a qualified hospital trainer, define the syllabus topic, and generate their formal appointment letter.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenAssignTrainerModal}
              className="btn-primary btn-sm bg-blue-600 hover:bg-blue-700 border-blue-600 flex items-center gap-1.5"
            >
              <GraduationCap size={14} />
              <span>Appoint Dedicated Trainer</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // 8. TRAINER COMPLETION REPORT PENDING
  if (status === 'training_in_progress') {
    if (isAssignedTrainer || canImcAct) {
      return (
        <div className="space-y-3 bg-blue-50/50 border border-blue-200 p-4 rounded-xl">
          <p className="text-xs text-blue-950 leading-relaxed font-medium">
            Training session is currently underway. Once delivered, upload the attendance register, specify the session duration in minutes, and submit findings for IMC verification.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenTrainerReportModal}
              className="btn-primary btn-sm bg-blue-600 hover:bg-blue-700 border-blue-600 flex items-center gap-1.5"
            >
              <FileText size={14} />
              <span>Submit Training Report & Attendance</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // 9. IMC FINAL REPORT PENDING
  if (status === 'pending_imc_report') {
    if (canImcAct) {
      return (
        <div className="space-y-3 bg-emerald-50/50 border border-emerald-200 p-4 rounded-xl">
          <p className="text-xs text-emerald-950 leading-relaxed font-medium">
            Management directives have been confirmed. Compile the comprehensive Hospital Quality Closure Report and officially resolve this incident.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenImcReportModal}
              className="btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700 border-emerald-600 flex items-center gap-1.5"
            >
              <CheckCircle2 size={14} />
              <span>Generate Official Quality Report</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // DEFAULT OBSERVER / WAITING CARD
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
      <Clock size={18} className="text-slate-400 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <h4 className="text-xs font-bold text-slate-800">
          Currently In Progress with {getStatusLabel(status)}
        </h4>
        <p className="text-xs text-slate-500 leading-relaxed">
          The assigned hospital stakeholders are actively reviewing this case. All decisions, directives, and verified reports will be posted serially in the Case Story above in real time.
        </p>
      </div>
    </div>
  );
}
