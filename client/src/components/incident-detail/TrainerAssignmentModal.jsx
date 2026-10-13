import React, { useState } from 'react';
import { GraduationCap, Calendar, BookOpen, User, Send } from 'lucide-react';
import { Modal, Spinner, Alert } from '../ui';
import { trainersApi } from '../../api';
import ResponsibleEmployeePicker from './ResponsibleEmployeePicker';
import toast from 'react-hot-toast';

export default function TrainerAssignmentModal({
  show,
  onClose,
  incident,
  onSuccess
}) {
  const [selectedTrainer, setSelectedTrainer] = useState([]);
  const [topic, setTopic] = useState('');
  const [instructions, setInstructions] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill topic if incident has category or description
  React.useEffect(() => {
    if (show && !topic && incident) {
      setTopic(`Standard Operating Protocol (SOP) & Equipment Handling: ${incident.incident_category || incident.incident_type || 'Safety'}`);
      // Default target date: 7 days from now
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setTargetDate(d.toISOString().split('T')[0]);
    }
  }, [show, incident]);

  const handleSubmit = async () => {
    if (selectedTrainer.length === 0) {
      toast.error('Please search and select a trainer.');
      return;
    }
    if (!topic.trim()) {
      toast.error('Please specify the training topic.');
      return;
    }

    const trainerUser = selectedTrainer[0];
    const trainerId = trainerUser.id || trainerUser.employee_id;

    setIsSubmitting(true);
    try {
      await trainersApi.assignTrainer(incident.id, {
        trainerId,
        trainingTopic: topic,
        instructions,
        targetCompletionDate: targetDate || null
      });

      toast.success('Trainer successfully assigned. Notification dispatched.');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to assign trainer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={show}
      onClose={onClose}
      title="Assign Dedicated Trainer"
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || selectedTrainer.length === 0 || !topic.trim()}
            className="btn-primary text-xs flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700"
          >
            {isSubmitting ? <Spinner size={14} className="text-white" /> : <GraduationCap size={14} />}
            Confirm Assignment & Notify Trainer
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert
          type="info"
          message="Management has mandated training/counselling. Select a qualified hospital trainer, educator, or senior coordinator to conduct the session."
        />

        {/* Trainer Selector */}
        <div>
          <ResponsibleEmployeePicker
            label="Search & Select Trainer"
            required
            selected={selectedTrainer}
            onChange={(list) => setSelectedTrainer(list.slice(-1))} // Single trainer
            placeholder="Type trainer or senior staff name or ID..."
          />
        </div>

        <div>
          <label className="field-label field-required text-xs">Training Topic / Module</label>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="input text-xs font-semibold"
            placeholder="e.g. Infusion Pump Handling & Medication Administration SOP"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="field-label text-xs">Target Completion Date</label>
            <input
              type="date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              className="input text-xs"
            />
          </div>
        </div>

        <div>
          <label className="field-label text-xs">Specific Instructions / Scope for Trainer</label>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={3}
            className="textarea text-xs"
            placeholder="Specify key failure points, mandatory practical demonstration, or assessment required..."
          />
        </div>
      </div>
    </Modal>
  );
}
