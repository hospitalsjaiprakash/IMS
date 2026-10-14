import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, FileCheck, Calendar, Clock, BookOpen, AlertCircle, CheckCircle2, User, Award, MapPin, Target, ShieldCheck, Lightbulb } from 'lucide-react';
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
  const [venue, setVenue] = useState('Ward Nursing Station');
  const [customVenue, setCustomVenue] = useState('');
  const [methodology, setMethodology] = useState('Practical Demonstration & Hands-on SOP Simulation');
  const [preAssessment, setPreAssessment] = useState('Basic Understanding (Needs Practical Reinforcement)');
  const [postAssessment, setPostAssessment] = useState('Certified Competent - Cleared for Independent Duty');
  const [capaRecommendations, setCapaRecommendations] = useState('');
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

    const finalVenue = venue === 'Other' ? (customVenue.trim() || 'Custom Facility') : venue;

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      if (trainerAssignment?.id) fd.append('assignmentId', trainerAssignment.id);
      fd.append('completionDate', completionDate);
      fd.append('durationHours', durationHours);
      fd.append('venue', finalVenue);
      fd.append('methodology', methodology);
      fd.append('preAssessment', preAssessment);
      fd.append('postAssessment', postAssessment);
      fd.append('capaRecommendations', capaRecommendations.trim());
      fd.append('summary', summary.trim());
      attachments.forEach(f => fd.append('attachments', f));

      await trainersApi.submitReport(incident.id, fd);
      toast.success('Training report submitted successfully. Forwarded to IMC for quality review.');
      queryClient.invalidateQueries({ queryKey: ['incident', incident?.id] });
      queryClient.invalidateQueries({ queryKey: ['incident', String(incident?.id)] });
      queryClient.invalidateQueries({ queryKey: ['incident', Number(incident?.id)] });
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
      title="Trainer Completion Report & Clinical Competency Form"
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
            Submit Completion Report & Attendance
          </button>
        </>
      }
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
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
          message="Complete all clinical training sections, evaluate trainee competency before and after the session, and upload the signed attendance evidence."
        />

        {/* Section 1: Session Logistics */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar size={13} className="text-indigo-600" /> 1. Session Logistics
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="field-label field-required text-xs">Conducted Date</label>
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
                min="0.5"
                value={durationHours}
                onChange={e => setDurationHours(e.target.value)}
                className="input text-xs font-semibold"
                placeholder="e.g. 1.5"
              />
            </div>
            <div>
              <label className="field-label field-required text-xs flex items-center gap-1">
                <MapPin size={12} className="text-slate-500" /> Venue / Location
              </label>
              <select
                value={venue}
                onChange={e => setVenue(e.target.value)}
                className="select w-full text-xs font-medium"
              >
                <option value="Ward Nursing Station">Ward Nursing Station</option>
                <option value="ICU / HDU Simulation Bay">ICU / HDU Simulation Bay</option>
                <option value="Operation Theatre (OT)">Operation Theatre (OT)</option>
                <option value="Clinical Skills & Simulation Lab">Clinical Skills & Simulation Lab</option>
                <option value="Conference / Training Hall">Conference / Training Hall</option>
                <option value="Department Duty Room">Department Duty Room</option>
                <option value="Other">Other (Specify below)</option>
              </select>
            </div>
          </div>
          {venue === 'Other' && (
            <div>
              <label className="field-label field-required text-xs">Specify Custom Venue</label>
              <input
                type="text"
                value={customVenue}
                onChange={e => setCustomVenue(e.target.value)}
                placeholder="Enter specific training venue or room..."
                className="input text-xs"
              />
            </div>
          )}
        </div>

        {/* Section 2: Methodology & Competency Assessment */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Target size={13} className="text-indigo-600" /> 2. Methodology & Competency Evaluation
          </div>

          <div>
            <label className="field-label field-required text-xs">Training Methodology Delivered</label>
            <select
              value={methodology}
              onChange={e => setMethodology(e.target.value)}
              className="select w-full text-xs font-semibold"
            >
              <option value="Practical Demonstration & Hands-on SOP Simulation">Practical Demonstration & Hands-on SOP Simulation</option>
              <option value="Classroom Theory & Protocol Walkthrough">Classroom Theory & Protocol Walkthrough</option>
              <option value="One-on-One Counselling & Mentorship">One-on-One Counselling & Mentorship</option>
              <option value="Equipment Troubleshooting & Calibration Walkthrough">Equipment Troubleshooting & Calibration Walkthrough</option>
              <option value="Blended Theory and Direct Bedside Observation">Blended Theory and Direct Bedside Observation</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="field-label field-required text-xs">Pre-Training Competency</label>
              <select
                value={preAssessment}
                onChange={e => setPreAssessment(e.target.value)}
                className="select w-full text-xs font-medium text-amber-800 bg-amber-50/50 border-amber-200"
              >
                <option value="Needs Fundamental Training (Novice / Unfamiliar with Protocol)">Needs Fundamental Training (Novice / Unfamiliar)</option>
                <option value="Basic Understanding (Needs Practical Reinforcement)">Basic Understanding (Needs Practical Reinforcement)</option>
                <option value="Proficient (Minor Deviation Review)">Proficient (Minor Deviation Review)</option>
              </select>
            </div>

            <div>
              <label className="field-label field-required text-xs">Post-Training Competency Certification</label>
              <select
                value={postAssessment}
                onChange={e => setPostAssessment(e.target.value)}
                className="select w-full text-xs font-semibold text-emerald-800 bg-emerald-50/50 border-emerald-200"
              >
                <option value="Certified Competent - Cleared for Independent Duty">Certified Competent - Cleared for Independent Duty</option>
                <option value="Satisfactory - Cleared with Periodic Audit">Satisfactory - Cleared with Periodic Audit</option>
                <option value="Conditional Competence - Requires Peer Supervision">Conditional Competence - Requires Peer Supervision</option>
                <option value="Needs Follow-Up Coaching / Re-session">Needs Follow-Up Coaching / Re-session</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Summary & Corrective Recommendations */}
        <div className="space-y-3">
          <div>
            <label className="field-label field-required text-xs">Session Summary & Practical Findings</label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={3}
              className="textarea text-xs leading-relaxed"
              placeholder="Detail learning objectives delivered, trainee participation, protocol adherence, and observations during practical demonstration..."
            />
          </div>

          <div>
            <label className="field-label text-xs flex items-center gap-1.5">
              <Lightbulb size={12} className="text-amber-500" />
              CAPA / Preventive Recommendations for Department (Optional)
            </label>
            <textarea
              value={capaRecommendations}
              onChange={e => setCapaRecommendations(e.target.value)}
              rows={2}
              className="textarea text-xs leading-relaxed"
              placeholder="e.g., Recommend updating unit checklist, adding laminated SOP chart beside equipment, or scheduling 6-month refresher..."
            />
          </div>
        </div>

        {/* Section 4: Mandatory Evidence Upload */}
        <div className="pt-2 border-t border-slate-200">
          <label className="field-label field-required text-xs flex items-center justify-between">
            <span className="flex items-center gap-1 font-bold text-slate-800">
              <ShieldCheck size={13} className="text-emerald-600" />
              Signed Attendance Sheet & Evaluation Evidence (Mandatory)
            </span>
            <span className="text-[10px] font-normal text-slate-500">PDF, JPG, PNG (Max 15MB)</span>
          </label>
          <FileUploadArea files={attachments} setFiles={setAttachments} />
        </div>
      </div>
    </Modal>
  );
}
