import React, { useState } from 'react';
import { Upload, FileCheck, Calendar, Clock, BookOpen, AlertCircle } from 'lucide-react';
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
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0]);
  const [durationHours, setDurationHours] = useState('1.5');
  const [methodology, setMethodology] = useState('Practical Demonstration & Hands-on SOP Simulation');
  const [summary, setSummary] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!summary.trim()) {
      toast.error('Please enter a summary of the training session.');
      return;
    }
    if (attachments.length === 0) {
      toast.error('Please upload attendance sheet or evaluation evidence.');
      return;
    }

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      if (trainerAssignment?.id) fd.append('assignmentId', trainerAssignment.id);
      fd.append('completionDate', completionDate);
      fd.append('durationHours', durationHours);
      fd.append('methodology', methodology);
      fd.append('summary', summary);
      attachments.forEach(f => fd.append('attachments', f));

      await trainersApi.submitReport(incident.id, fd);
      toast.success('Training report submitted successfully. Forwarded to IMC for review.');
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
        <Alert
          type="info"
          message="Provide session details, methodology, participant comprehension evaluation, and upload the signed attendance / score sheet."
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
            <label className="field-label field-required text-xs">Duration (Hours)</label>
            <input
              type="number"
              step="0.5"
              value={durationHours}
              onChange={e => setDurationHours(e.target.value)}
              className="input text-xs"
              placeholder="e.g. 2.0"
            />
          </div>
        </div>

        <div>
          <label className="field-label field-required text-xs">Training Methodology</label>
          <select
            value={methodology}
            onChange={e => setMethodology(e.target.value)}
            className="select w-full text-xs"
          >
            <option value="Practical Demonstration & Hands-on SOP Simulation">Practical Demonstration & Hands-on SOP Simulation</option>
            <option value="Classroom Theory & Protocol Walkthrough">Classroom Theory & Protocol Walkthrough</option>
            <option value="One-on-One Counselling & Mentorship">One-on-One Counselling & Mentorship</option>
            <option value="Online / Video-assisted Learning with MCQ Quiz">Online / Video-assisted Learning with MCQ Quiz</option>
            <option value="Equipment Troubleshooting & Maintenance Protocol">Equipment Troubleshooting & Maintenance Protocol</option>
            <option value="Mixed Blended Learning">Mixed Blended Learning</option>
          </select>
        </div>

        <div>
          <label className="field-label field-required text-xs">Summary of Session & Assessment</label>
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            rows={4}
            className="textarea text-xs"
            placeholder="Summarize key learning objectives covered, employee attendance, and performance during practical/verbal assessment..."
          />
        </div>

        <div>
          <label className="field-label field-required text-xs">
            Upload Signed Attendance Sheet / Evaluation Evidence (Mandatory)
          </label>
          <FileUploadArea files={attachments} setFiles={setAttachments} />
        </div>
      </div>
    </Modal>
  );
}
