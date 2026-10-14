import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  GraduationCap, CheckCircle2, Clock, Calendar, Download, Eye, 
  ShieldCheck, UserCheck, AlertCircle, Award, Users, RefreshCw, FileText, XCircle, Printer, QrCode,
  MapPin, Target, Lightbulb
} from 'lucide-react';
import { Modal, Spinner, Alert } from '../ui';
import { trainersApi, attachmentsApi, UPLOADS_URL } from '../../api';
import toast from 'react-hot-toast';

export default function TrainingProgressCard({
  incident,
  trainers = [],
  user,
  canImcAct,
  isManagement,
  onOpenAssignModal,
  onOpenReportModal,
  onRefetch
}) {
  const queryClient = useQueryClient();
  const [verifyModal, setVerifyModal] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState('');
  const [reworkModal, setReworkModal] = useState(false);
  const [reworkReason, setReworkReason] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [viewAppointmentLetterModal, setViewAppointmentLetterModal] = useState(false);
  const [selectedLetterAssignment, setSelectedLetterAssignment] = useState(null);

  const isImcLead = Boolean(user?.is_imc_lead || user?.isImcLead || user?.role === 'imc' || user?.is_system_admin || user?.role === 'system_admin');
  const isMgmtUser = Boolean(isManagement || user?.role === 'head_management' || user?.role === 'system_admin');

  const activeAssignment = trainers[trainers.length - 1]; // Latest assignment
  const isPendingAssignment = incident?.status === 'pending_trainer_assignment';
  const isInProgress = incident?.status === 'training_in_progress';
  const isPendingImcReview = incident?.status === 'pending_imc_training_review';
  const isNeedsTraining = Boolean(incident?.needs_training);

  const canAssignTrainer = isImcLead && (
    isPendingAssignment ||
    (isNeedsTraining && (!trainers.length || activeAssignment?.status === 'rework_requested'))
  );

  // Can user submit training report? (Assigned trainer, or IMC lead / Admin on behalf)
  const isAssignedTrainer = Boolean(
    activeAssignment && (
      activeAssignment.trainer_id === user?.id ||
      activeAssignment.trainer_code === user?.employee_id
    )
  );
  const canSubmitReport = (isAssignedTrainer || isImcLead) && isInProgress;

  const invalidateTrainingQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['incident', incident?.id] });
    queryClient.invalidateQueries({ queryKey: ['incidents'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['all-incidents-analytics'] });
  };

  const handleImcVerify = async () => {
    setIsVerifying(true);
    try {
      await trainersApi.imcVerify(incident.id, {
        assignmentId: activeAssignment?.id,
        action: 'VERIFY',
        reviewNotes: verifyNotes || 'Training verified and endorsed by IMC.'
      });
      toast.success('Training completion verified by IMC. Forwarded to Management for closure.');
      setVerifyModal(false);
      setVerifyNotes('');
      invalidateTrainingQueries();
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to verify training.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleImcRework = async () => {
    if (!reworkReason.trim()) {
      toast.error('Please specify why a re-session or additional evidence is required.');
      return;
    }
    setIsVerifying(true);
    try {
      await trainersApi.imcVerify(incident.id, {
        assignmentId: activeAssignment?.id,
        action: 'REWORK',
        reviewNotes: reworkReason.trim()
      });
      toast.success('Training returned to Trainer for follow-up session.');
      setReworkModal(false);
      setReworkReason('');
      invalidateTrainingQueries();
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to return training for rework.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleManagementClose = async () => {
    if (!window.confirm('Confirm training completion and officially CLOSE this incident file?')) return;
    setIsClosing(true);
    try {
      await trainersApi.managementClose(incident.id, {
        assignmentId: activeAssignment?.id
      });
      toast.success('Training confirmed and incident officially CLOSED.');
      invalidateTrainingQueries();
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to close incident.');
    } finally {
      setIsClosing(false);
    }
  };

  const handleDownloadAttachment = async (attId, fileName) => {
    try {
      const res = await attachmentsApi.getDownloadUrl(attId);
      const url = res.data?.url || res.data?.downloadUrl;
      if (url) {
        window.open(url, '_blank');
      } else {
        window.open(`${UPLOADS_URL}/${fileName}`, '_blank');
      }
    } catch (e) {
      window.open(`${UPLOADS_URL}/${fileName}`, '_blank');
    }
  };

  const shouldRenderCard = Boolean(
    trainers.length > 0 ||
    isNeedsTraining ||
    isPendingAssignment ||
    isInProgress ||
    isPendingImcReview
  );

  if (!shouldRenderCard) {
    return null;
  }

  const isVerifiedStatus = activeAssignment?.status === 'verified' || activeAssignment?.status === 'verified_by_imc';

  return (
    <>
      <div className="card p-5 border border-indigo-200 bg-white shadow-sm space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
              <GraduationCap size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800">Mandatory Training & CAPA Protocol</h2>
                {trainers.length > 0 && (
                  <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {trainers.length} Session{trainers.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Staff competency building, corrective protocol training, and hands-on demonstration verification
              </p>
            </div>
          </div>

          {/* Action buttons on top right */}
          <div className="flex items-center gap-2">
            {canAssignTrainer && (
              <button
                type="button"
                onClick={onOpenAssignModal}
                className="btn-primary btn-sm text-xs flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm"
              >
                <GraduationCap size={13} /> {trainers.length > 0 ? 'Reassign / Add Trainer' : 'Assign Trainer'}
              </button>
            )}
            {canSubmitReport && (
              <button
                type="button"
                onClick={onOpenReportModal}
                className="btn-primary btn-sm text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 border-emerald-600 shadow-sm"
              >
                <Award size={13} /> Submit Training Report & Attendance
              </button>
            )}
          </div>
        </div>

        {/* State Banner 1: Pending Assignment or Needs Training */}
        {(isPendingAssignment || (isNeedsTraining && !trainers.length)) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1 max-w-xl">
              <p className="font-bold flex items-center gap-1.5 text-amber-800">
                <Clock size={14} className="text-amber-600" /> Awaiting Trainer Appointment (IMC Level)
              </p>
              <p className="text-amber-700 text-[11px] leading-relaxed">
                Management has ordered mandatory corrective training for the involved employee(s). The IMC appoints a qualified hospital trainer directly. An official Trainer Appointment Letter with verified QR code will be auto-generated and dispatched.
              </p>
            </div>
            {isImcLead && (
              <button
                type="button"
                onClick={onOpenAssignModal}
                className="btn-primary btn-sm text-xs bg-indigo-600 hover:bg-indigo-700 shadow-sm ml-auto"
              >
                Assign Trainer Now
              </button>
            )}
          </div>
        )}

        {/* State Banner 2: In Progress */}
        {isInProgress && activeAssignment && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1 max-w-xl">
              <p className="font-bold flex items-center gap-1.5 text-blue-800">
                <Clock size={14} className="text-blue-600" /> Hands-on Training Session in Progress
              </p>
              <p className="text-blue-700 text-[11px] leading-relaxed">
                Assigned Trainer: <strong>{activeAssignment.trainer_name}</strong> ({activeAssignment.trainer_code || 'Staff'}). Target Date:{' '}
                {activeAssignment.target_completion_date ? activeAssignment.target_completion_date.split('T')[0] : 'Open'}.
              </p>
              {activeAssignment.trainee_name && (
                <p className="text-blue-800 text-[11px] font-semibold">
                  Trainee(s): {activeAssignment.trainee_name}
                </p>
              )}
            </div>
            {canSubmitReport && (
              <button
                type="button"
                onClick={onOpenReportModal}
                className="btn-primary btn-sm text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-600 shadow-sm ml-auto"
              >
                Submit Session Report
              </button>
            )}
          </div>
        )}

        {/* State Banner 3: Pending IMC Verification */}
        {isPendingImcReview && activeAssignment && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-xs text-purple-900 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold flex items-center gap-1.5 text-purple-800 text-sm">
                  <ShieldCheck size={16} className="text-purple-600" /> Training Completed — Awaiting IMC Review
                </p>
                <p className="text-purple-700 text-[11px] mt-0.5 leading-relaxed">
                  Trainer {activeAssignment.trainer_name} has submitted the session documentation and signed attendance sheet. The IMC Convenor must review evidence and either endorse it to Management or request a follow-up re-session.
                </p>
              </div>
            </div>
            {isImcLead && (
              <div className="pt-2 border-t border-purple-100 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setVerifyModal(true)}
                  className="btn-primary btn-sm text-xs bg-purple-600 hover:bg-purple-700 border-purple-600 flex items-center gap-1.5 shadow-sm"
                >
                  <UserCheck size={13} /> Verify Evidence & Forward to Management
                </button>
                <button
                  type="button"
                  onClick={() => setReworkModal(true)}
                  className="btn-secondary btn-sm text-xs text-rose-700 hover:bg-rose-50 border-rose-200"
                >
                  <RefreshCw size={12} /> Request Follow-Up / Re-session
                </button>
              </div>
            )}
          </div>
        )}

        {/* State Banner 4: Verified by IMC, at Management level */}
        {isVerifiedStatus && (incident?.status === 'with_head_management' || incident?.status === 'closed') && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold flex items-center gap-1.5 text-emerald-800 text-sm">
                  <CheckCircle2 size={16} className="text-emerald-600" /> Training Validated & Endorsed by IMC
                </p>
                <p className="text-emerald-700 text-[11px] mt-0.5 leading-relaxed">
                  IMC Convenor verified the training evidence on{' '}
                  {activeAssignment.verified_at ? activeAssignment.verified_at.split('T')[0] : 'recent date'}.
                  {activeAssignment.verification_notes && (
                    <span className="block italic mt-1 font-serif text-slate-700">&quot;{activeAssignment.verification_notes}&quot;</span>
                  )}
                </p>
              </div>
            </div>

            {isMgmtUser && incident?.status === 'with_head_management' && (
              <div className="pt-2 border-t border-emerald-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManagementClose}
                  disabled={isClosing}
                  className="btn-primary btn-sm text-xs bg-emerald-600 hover:bg-emerald-700 border-emerald-600 flex items-center gap-1.5 shadow-sm"
                >
                  {isClosing ? <Spinner size={12} className="text-white" /> : <ShieldCheck size={13} />}
                  Confirm CAPA Completion & Officially Close Incident
                </button>
              </div>
            )}
          </div>
        )}

        {/* Trainer Assignments List */}
        {trainers.map((t, idx) => (
          <div
            key={t.id || idx}
            className="p-4 rounded-xl border bg-slate-50/80 border-slate-200 space-y-3"
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-800">
                    Trainer: {t.trainer_name}
                  </span>
                  {t.trainer_code && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600">
                      {t.trainer_code}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {[t.trainer_designation, t.trainer_department].filter(Boolean).join(' • ')}
                  </span>
                </div>
                <h4 className="text-xs font-semibold text-indigo-900 mt-1">
                  Topic: {t.training_topic}
                </h4>
                {t.trainee_name && (
                  <p className="text-[11px] text-slate-700 mt-0.5 font-medium flex items-center gap-1">
                    <Users size={12} className="text-indigo-600" />
                    Trainee(s): <strong>{t.trainee_name}</strong>
                    {t.trainee_department ? ` (${t.trainee_department})` : ''}
                  </p>
                )}
                {t.instructions && (
                  <p className="text-[11px] text-slate-600 mt-0.5 italic">
                    Instructions: &quot;{t.instructions}&quot;
                  </p>
                )}
              </div>

              {/* Status Badge */}
              <div className="shrink-0">
                {t.status === 'assigned' && (
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                    Assigned
                  </span>
                )}
                {t.status === 'completed' && (
                  <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                    Report Submitted
                  </span>
                )}
                {(t.status === 'verified' || t.status === 'verified_by_imc') && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                    Verified by IMC
                  </span>
                )}
                {t.status === 'rework_requested' && (
                  <span className="text-[10px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
                    Re-session Requested
                  </span>
                )}
                {t.status === 'closed' && (
                  <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    Closed by Management
                  </span>
                )}
              </div>
            </div>

            {/* Official Appointment Letter Row */}
            {(t.letter_reference_number || t.appointment_letter_id) && (
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-lg p-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-indigo-900 bg-white px-2 py-0.5 rounded border border-indigo-200">
                    {t.letter_reference_number || 'JPHRC/TRN'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={10} /> Dispatched to Trainer
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLetterAssignment(t);
                    setViewAppointmentLetterModal(true);
                  }}
                  className="btn-secondary btn-sm text-[11px] flex items-center gap-1 hover:border-indigo-400 hover:text-indigo-700 shadow-xs ml-auto"
                >
                  <Eye size={12} /> View / Print Appointment Letter
                </button>
              </div>
            )}

            {/* Completion Report Details (if submitted) */}
            {t.status !== 'assigned' && (
              <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-2.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-100 pb-2 flex-wrap gap-2">
                  <span>
                    Conducted on: <strong className="text-slate-700">{t.completion_date?.split('T')[0] || t.conducted_at?.split('T')[0]}</strong>
                  </span>
                  <span>
                    Duration: <strong className="text-slate-700">{t.duration_hours || '1.0'} hrs</strong>
                  </span>
                  {t.venue && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} className="text-slate-400" />
                      Venue: <strong className="text-slate-700">{t.venue}</strong>
                    </span>
                  )}
                  <span>
                    Methodology: <strong className="text-slate-700">{t.methodology || 'Practical demonstration'}</strong>
                  </span>
                </div>

                {/* Structured Competency Assessment Badges */}
                {(t.pre_assessment || t.post_assessment) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    {t.pre_assessment && (
                      <div className="p-2 bg-amber-50/70 border border-amber-200/80 rounded-lg text-amber-900">
                        <span className="font-bold block text-[10px] text-amber-700 uppercase">Pre-Training Competency:</span>
                        <span>{t.pre_assessment}</span>
                      </div>
                    )}
                    {t.post_assessment && (
                      <div className="p-2 bg-emerald-50/70 border border-emerald-200/80 rounded-lg text-emerald-900">
                        <span className="font-bold block text-[10px] text-emerald-700 uppercase">Post-Training Certification:</span>
                        <span className="font-medium">{t.post_assessment}</span>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-slate-700 text-xs leading-relaxed whitespace-pre-line">
                  <strong>Summary & Findings:</strong> {t.summary || t.trainer_report_text || 'Training conducted as instructed.'}
                </p>

                {t.capa_recommendations && (
                  <div className="p-2 bg-amber-50/60 border border-amber-200/70 rounded-lg text-[11px] text-amber-950 flex items-start gap-1.5">
                    <Lightbulb size={13} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-900">Trainer CAPA Recommendation: </span>
                      {t.capa_recommendations}
                    </div>
                  </div>
                )}

                {(t.report_attachment_id || t.trainer_attachment_id) && (
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-[11px]">
                    <span className="text-slate-600 flex items-center gap-1 font-medium">
                      <FileText size={13} className="text-indigo-600" />
                      Attendance Sheet & Evidence: {t.report_file_name || t.report_original_filename || 'Evaluation Attachment'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDownloadAttachment(t.report_attachment_id || t.trainer_attachment_id, t.report_file_name || t.report_original_filename)}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                    >
                      <Download size={12} /> Download Evidence
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* --- IMC VERIFY MODAL --- */}
      {verifyModal && (
        <Modal
          open={verifyModal}
          onClose={() => setVerifyModal(false)}
          title="Verify Training Evidence & Forward to Management"
          size="md"
          footer={
            <>
              <button onClick={() => setVerifyModal(false)} className="btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={handleImcVerify}
                disabled={isVerifying}
                className="btn-primary text-xs bg-purple-600 hover:bg-purple-700 border-purple-600"
              >
                {isVerifying ? <Spinner size={12} className="text-white" /> : <ShieldCheck size={13} />}
                Confirm Verification & Forward to Management
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <Alert type="info" message="Confirm that you have reviewed the training summary and verified the uploaded attendance sheet. This will forward the incident to Executive Management for final closure." />
            <div>
              <label className="field-label text-xs">IMC Verification Remarks / Quality Sign-off</label>
              <textarea
                value={verifyNotes}
                onChange={e => setVerifyNotes(e.target.value)}
                className="textarea text-xs"
                rows={3}
                placeholder="e.g. Attendance verified. Trainee demonstrated practical competency in equipment handling. Protocol compliance achieved."
              />
            </div>
          </div>
        </Modal>
      )}

      {/* --- IMC REWORK MODAL --- */}
      {reworkModal && (
        <Modal
          open={reworkModal}
          onClose={() => setReworkModal(false)}
          title="Request Follow-Up / Re-session from Trainer"
          size="md"
          footer={
            <>
              <button onClick={() => setReworkModal(false)} className="btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={handleImcRework}
                disabled={isVerifying || !reworkReason.trim()}
                className="btn-danger text-xs"
              >
                {isVerifying ? <Spinner size={12} className="text-white" /> : <RefreshCw size={13} />}
                Return to Trainer for Re-session
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <Alert type="warning" message="This will return the training status back to 'training_in_progress' and notify the trainer that additional evidence or a follow-up session is required." />
            <div>
              <label className="field-label field-required text-xs">Reason for Re-session / Required Corrections</label>
              <textarea
                value={reworkReason}
                onChange={e => setReworkReason(e.target.value)}
                className="textarea text-xs"
                rows={4}
                placeholder="Specify what was inadequate (e.g. Attendance sheet unsigned, practical duration too short, or participant failed competency check)..."
              />
            </div>
          </div>
        </Modal>
      )}

      {/* --- TRAINER APPOINTMENT LETTER MODAL --- */}
      {viewAppointmentLetterModal && (selectedLetterAssignment || activeAssignment) && (() => {
        const letterTarget = selectedLetterAssignment || activeAssignment;
        return (
          <Modal
            open={viewAppointmentLetterModal}
            onClose={() => setViewAppointmentLetterModal(false)}
            title="Official Trainer Appointment Letter"
            size="xl"
            footer={
              <div className="flex items-center justify-between w-full">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Printer size={13} /> Print Official Letter
                </button>
                <button
                  type="button"
                  onClick={() => setViewAppointmentLetterModal(false)}
                  className="btn-secondary text-xs"
                >
                  Close
                </button>
              </div>
            }
          >
            <div className="bg-white p-6 rounded-lg border border-slate-200 space-y-5 text-slate-800 font-sans shadow-xs">
              {/* Header letterhead */}
              <div className="border-b-2 border-indigo-900 pb-4 text-center">
                <h2 className="text-lg font-black text-indigo-950 uppercase tracking-wide">
                  JAIPRAKASH HOSPITALS & RESEARCH CENTRE
                </h2>
                <p className="text-xs font-semibold text-indigo-700 tracking-wider uppercase mt-0.5">
                  Incident Management Committee (IMC) — Quality Assurance & Patient Safety
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Near Dandiapali, Rourkela, Odisha 769004 | Email: imc@jaiprakashhospitals.com
                </p>
              </div>

              {/* Reference and Date */}
              <div className="flex items-center justify-between text-xs font-bold border-b border-slate-200 pb-2">
                <div>Ref: <span className="font-mono text-indigo-900">{letterTarget.letter_reference_number || 'JPHRC/TRN'}</span></div>
                <div>Date: <span>{letterTarget.letter_date ? new Date(letterTarget.letter_date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}</span></div>
              </div>

              {/* Recipient */}
              <div className="text-xs space-y-0.5">
                <div className="font-semibold text-slate-500">To,</div>
                <div className="font-bold text-sm text-slate-900">{letterTarget.trainer_name}</div>
                <div className="text-slate-600">{letterTarget.trainer_designation || 'Specialist / Lead Trainer'}</div>
                <div className="text-slate-600">{letterTarget.trainer_department || 'Clinical / Hospital Operations'}</div>
              </div>

              {/* Subject */}
              <div className="text-xs font-bold text-slate-900 bg-slate-50 p-2.5 rounded border border-slate-200">
                Subject: {letterTarget.letter_subject || `Trainer Appointment - Incident ${incident?.reference_id}`}
              </div>

              {/* Salutation & Body */}
              <div className="text-xs space-y-3 leading-relaxed">
                <p className="font-semibold">{letterTarget.letter_salutation || 'Dear Doctor / Staff Member,'}</p>
                <div className="whitespace-pre-wrap font-normal text-slate-700">
                  {letterTarget.letter_body_text || letterTarget.training_instructions}
                </div>
              </div>

              {/* Verification and Sign-off */}
              <div className="pt-4 border-t border-slate-200 flex items-end justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {letterTarget.letter_qr_code_url && (
                    <div className="text-center">
                      <img
                        src={letterTarget.letter_qr_code_url}
                        alt="IMS QR Code"
                        className="w-20 h-20 border border-slate-200 p-1 rounded bg-white shadow-xs"
                      />
                      <div className="text-[9px] text-slate-500 mt-1 font-mono">Scan to Verify</div>
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 max-w-xs space-y-0.5">
                    <div className="font-semibold text-slate-700">Digital Authentication</div>
                    <div>This official appointment directive is authenticated under JPHRC Clinical Governance & CAPA Protocol.</div>
                  </div>
                </div>

                <div className="text-right text-xs space-y-1">
                  <div className="font-bold text-slate-900">For Incident Management Committee</div>
                  <div className="text-[11px] text-slate-600">Convenor / Lead — Incident Management</div>
                  <div className="text-[10px] text-slate-400">Jaiprakash Hospitals & Research Centre</div>
                </div>
              </div>

              {/* CC List */}
              {letterTarget.letter_cc_recipients && (
                <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-500 space-y-0.5">
                  <div className="font-semibold text-slate-700">Carbon Copy (CC):</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {(Array.isArray(letterTarget.letter_cc_recipients)
                      ? letterTarget.letter_cc_recipients
                      : typeof letterTarget.letter_cc_recipients === 'string'
                        ? JSON.parse(letterTarget.letter_cc_recipients || '[]')
                        : []
                    ).map((cc, idx) => (
                      <span key={idx}>• {cc.label || cc.name || cc}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Modal>
        );
      })()}
    </>
  );
}
