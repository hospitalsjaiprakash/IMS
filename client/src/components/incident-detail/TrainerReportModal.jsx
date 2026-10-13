import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, FileCheck, Calendar, Clock, BookOpen, AlertCircle, CheckCircle2, User, Award } from 'lucide-react';
import { Modal, Spinner, Alert } from '../ui';
import { trainersApi } from '../../api';
import FileUploadArea from './FileUploadArea';
import toast from 'react-hot-toast';

export default function TrainerReportModal({
  show,
  onClose,
  incident,
  trainerAssignment,
  onSuccess
}) {
  const queryClient = useQueryClient();
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0]);
  const [durationHours, setDurationHours] = useState('1.5');
  const [methodology, setMethodology] = useState('Practical Demonstration & Hands-on SOP Simulation');
  const [assessmentOutcome, setAssessmentOutcome] = useState('Satisfactory - Staff Competency Verified');
  const [summary, setSummary] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!summary.trim()) {
      toast.error('Please enter a summary of the training session.');
      return;
    }
    if (attachments.length === 0) {
      toast.error('Please upload the signed attendance sheet or evaluation evidence.');
      return;
    }

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      if (trainerAssignment?.id) fd.append('assignmentId', trainerAssignment.id);
      fd.append('completionDate', completionDate);
      fd.append('durationHours', durationHours);
      fd.append('methodology', `${methodology} (Assessment: ${assessmentOutcome})`);
      fd.append('summary', `[Assessment: ${assessmentOutcome}]\n\n${summary}`);
      attachments.forEach(f => fd.append('attachments', f));

      await trainersApi.submitReport(incident.id, fd);
      toast.success('Training report submitted successfully. Forwarded to IMC for quality review.');
      queryClient.invalidateQueries({ queryKey: ['incident', incident?.id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-incidents-analytics'] });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit training report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={show}
      onClose={onClose}
      title="Submit Training Completion Documentation"
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !summary.trim() || attachments.length === 0}
            className="btn-primary text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
          >
            {isSubmitting ? <Spinner size={14} className="text-white" /> : <FileCheck size={14} />}
            Submit Report & Attendance Evidence
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Assignment Context Banner */}
        {trainerAssignment && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1 text-xs text-indigo-900">
            <div className="font-bold flex items-center gap-1.5 text-indigo-800">
              <Award size={14} className="text-indigo-600" />
              Assigned Training Module
            </div>
            <p>
              <strong>Topic:</strong> {trainerAssignment.training_topic}
            </p>
            <p className="text-indigo-700 text-[11px]">
              <strong>Trainee(s):</strong> {trainerAssignment.trainee_name || 'Designated Staff'}
              {trainerAssignment.trainee_department ? ` (${trainerAssignment.trainee_department})` : ''}
            </p>
            {trainerAssignment.instructions && (
              <p className="text-[10px] text-slate-500 italic mt-0.5">
                Instructions: &quot;{trainerAssignment.instructions}&quot;
              </p>
            )}
          </div>
        )}

        <Alert
          type="info"
          message="Provide session details, methodology, participant comprehension evaluation, and upload the signed physical attendance / score sheet."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="field-label field-required text-xs">Session Completion Date</label>
            <input
              type="date"
              value={completionDate}
              onChange={e => setCompletionDate(e.target.value)}
              className="input text-xs"
            />
          </div>
          <div>
            <label className="field-label field-required text-xs">Session Duration (Hours)</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={durationHours}
              onChange={e => setDurationHours(e.target.value)}
              className="input text-xs font-semibold"
              placeholder="e.g. 1.5"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="field-label field-required text-xs">Training Methodology</label>
            <select
              value={methodology}
              onChange={e => setMethodology(e.target.value)}
              className="select w-full text-xs font-semibold"
            >
              <option value="Practical Demonstration & Hands-on SOP Simulation">Practical Demonstration & Hands-on SOP Simulation</option>
              <option value="Classroom Theory & Protocol Walkthrough">Classroom Theory & Protocol Walkthrough</option>
              <option value="One-on-One Counselling & Mentorship">One-on-One Counselling & Mentorship</option>
              <option value="Equipment Troubleshooting & Calibration Walkthrough">Equipment Troubleshooting & Calibration Walkthrough</option>
              <option value="Mixed Blended Learning">Mixed Blended Learning</option>
            </select>
          </div>

          <div>
            <label className="field-label field-required text-xs">Assessment Outcome</label>
            <select
              value={assessmentOutcome}
              onChange={e => setAssessmentOutcome(e.target.value)}
              className="select w-full text-xs font-semibold text-emerald-800"
            >
              <option value="Satisfactory - Staff Competency Verified">Satisfactory - Staff Competency Verified</option>
              <option value="Needs Follow-up Coaching / Re-session">Needs Follow-up Coaching / Re-session</option>
            </select>
          </div>
        </div>

        <div>
          <label className="field-label field-required text-xs">Summary of Session & Assessment Findings</label>
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            rows={4}
            className="textarea text-xs leading-relaxed"
            placeholder="Detail learning objectives delivered, trainee participation, equipment handled, and practical evaluation results..."
          />
        </div>

        <div>
          <label className="field-label field-required text-xs flex items-center justify-between">
            <span>Upload Signed Attendance Sheet & Assessment Photos (Mandatory)</span>
            <span className="text-[10px] font-normal text-slate-500">PDF, JPG, PNG</span>
          </label>
          <FileUploadArea files={attachments} setFiles={setAttachments} />
        </div>
      </div>
    </Modal>
  );
}
