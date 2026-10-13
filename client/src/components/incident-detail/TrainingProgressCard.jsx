import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  GraduationCap, CheckCircle2, Clock, Calendar, Download, Eye, 
  ShieldCheck, UserCheck, AlertCircle, Award, Users, RefreshCw, FileText, XCircle 
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

  const isImcLead = Boolean(user?.is_imc_lead || user?.isImcLead || user?.role === 'imc' || user?.is_system_admin || user?.role === 'system_admin');
  const isMgmtUser = Boolean(isManagement || user?.role === 'head_management' || user?.role === 'system_admin');

  const activeAssignment = trainers[trainers.length - 1]; // Latest assignment
  const isPendingAssignment = incident?.status === 'pending_trainer_assignment';
  const isInProgress = incident?.status === 'training_in_progress';
  const isPendingImcReview = incident?.status === 'pending_imc_training_review';

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

  if (!trainers.length && !isPendingAssignment && !isInProgress && !isPendingImcReview) {
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
            {isPendingAssignment && isImcLead && (
              <button
                type="button"
                onClick={onOpenAssignModal}
                className="btn-primary btn-sm text-xs flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 shadow-sm"
              >
                <GraduationCap size={13} /> Assign Trainer
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

        {/* State Banner 1: Pending Assignment */}
        {isPendingAssignment && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1 max-w-xl">
              <p className="font-bold flex items-center gap-1.5 text-amber-800">
                <Clock size={14} className="text-amber-600" /> Awaiting Trainer Appointment (IMC Level)
              </p>
              <p className="text-amber-700 text-[11px] leading-relaxed">
                Management has ordered mandatory training / retraining for the involved employee(s). The IMC must appoint a qualified hospital trainer or educator to deliver the session.
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

            {/* Completion Report Details (if submitted) */}
            {t.status !== 'assigned' && (
              <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-100 pb-1.5 flex-wrap gap-2">
                  <span>
                    Conducted on: <strong className="text-slate-700">{t.completion_date?.split('T')[0] || t.conducted_at?.split('T')[0]}</strong>
                  </span>
                  <span>
                    Duration: <strong className="text-slate-700">{t.duration_hours || '1.0'} hrs</strong>
                  </span>
                  <span>
                    Methodology: <strong className="text-slate-700">{t.methodology || 'Practical demonstration'}</strong>
                  </span>
                </div>

                <p className="text-slate-700 text-xs leading-relaxed whitespace-pre-line">
                  <strong>Summary & Findings:</strong> {t.summary || t.trainer_report_text || 'Training conducted as instructed.'}
                </p>

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
    </>
  );
}
