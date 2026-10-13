import React, { useState, useEffect } from 'react';
import { GraduationCap, Calendar, BookOpen, User, Send, CheckSquare, Square, Users } from 'lucide-react';
import { Modal, Spinner, Alert } from '../ui';
import { trainersApi } from '../../api';
import ResponsibleEmployeePicker from './ResponsibleEmployeePicker';
import toast from 'react-hot-toast';

export default function TrainerAssignmentModal({
  show,
  onClose,
  incident,
  responsibleEmployees = [],
  onSuccess
}) {
  const [selectedTrainer, setSelectedTrainer] = useState([]);
  const [selectedTraineeIds, setSelectedTraineeIds] = useState([]);
  const [topic, setTopic] = useState('');
  const [instructions, setInstructions] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill topic and trainees when modal opens
  useEffect(() => {
    if (!show) return;

    if (responsibleEmployees.length > 0) {
      setSelectedTraineeIds(responsibleEmployees.map(e => e.employee_id || e.emp_id || e.id));
    }

    if (!topic && incident) {
      const category = incident.incident_category || incident.incident_type || 'Clinical / Safety';
      setTopic(`Standard Operating Protocol (SOP) & Corrective Competency: ${category}`);
      
      // Default target date: 7 days from now
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setTargetDate(d.toISOString().split('T')[0]);
    }
  }, [show, incident, responsibleEmployees]);

  const toggleTrainee = (empId) => {
    if (selectedTraineeIds.includes(empId)) {
      if (selectedTraineeIds.length === 1) {
        toast.error('At least one trainee must be assigned.');
        return;
      }
      setSelectedTraineeIds(selectedTraineeIds.filter(id => id !== empId));
    } else {
      setSelectedTraineeIds([...selectedTraineeIds, empId]);
    }
  };

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

    const chosenTrainees = responsibleEmployees.filter(e => 
      selectedTraineeIds.includes(e.employee_id || e.emp_id || e.id)
    );

    const traineeName = chosenTrainees.map(t => t.full_name || t.name).join(', ') || 'Concerned Staff';
    const traineeDept = [...new Set(chosenTrainees.map(t => t.department_name || t.department).filter(Boolean))].join(', ');
    const traineeDesig = [...new Set(chosenTrainees.map(t => t.designation).filter(Boolean))].join(', ');
    const primaryTraineeId = chosenTrainees[0]?.employee_id || chosenTrainees[0]?.id || 'COHORT';

    setIsSubmitting(true);
    try {
      await trainersApi.assignTrainer(incident.id, {
        trainerId,
        trainingTopic: topic,
        instructions,
        targetCompletionDate: targetDate || null,
        traineeEmployeeId: primaryTraineeId,
        traineeName,
        traineeDepartment: traineeDept,
        traineeDesignation: traineeDesig,
        traineeIds: selectedTraineeIds
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
          message="Management has mandated corrective training. Appoint a qualified clinical or operational trainer to deliver a hands-on session and upload attendance evidence."
        />

        {/* Trainees Roster Selection */}
        {responsibleEmployees.length > 0 && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <label className="field-label text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-800 font-bold">
                <Users size={14} className="text-indigo-600" />
                Select Trainee(s) to Undergo Training ({selectedTraineeIds.length} of {responsibleEmployees.length})
              </span>
              <span className="text-[10px] text-slate-500">
                Staff involved in incident
              </span>
            </label>

            <div className="space-y-1.5">
              {responsibleEmployees.map(emp => {
                const idVal = emp.employee_id || emp.emp_id || emp.id;
                const isChecked = selectedTraineeIds.includes(idVal);

                return (
                  <button
                    key={idVal}
                    type="button"
                    onClick={() => toggleTrainee(idVal)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                      isChecked 
                        ? 'bg-white border-indigo-300 shadow-2xs' 
                        : 'bg-slate-100/60 border-slate-200 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isChecked ? (
                        <CheckSquare size={16} className="text-indigo-600 shrink-0" />
                      ) : (
                        <Square size={16} className="text-slate-400 shrink-0" />
                      )}
                      <div>
                        <span className="font-semibold text-xs text-slate-900">
                          {emp.full_name || emp.name}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-1.5 font-mono">
                          ({emp.emp_id || emp.employee_id || 'ID'})
                        </span>
                        <p className="text-[10px] text-slate-500">
                          {[emp.designation, emp.department_name || emp.department].filter(Boolean).join(' • ')}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                      Mandatory Trainee
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Trainer Selector */}
        <div>
          <ResponsibleEmployeePicker
            label="Search & Select Dedicated Trainer"
            required
            selected={selectedTrainer}
            onChange={(list) => setSelectedTrainer(list.slice(-1))} // Single trainer
            placeholder="Search educator, senior consultant, coordinator, or trainer name..."
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
          <label className="field-label text-xs">Specific Instructions & Guidelines for Trainer</label>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={3}
            className="textarea text-xs"
            placeholder="Detail the failure points observed, mandatory practical demonstration requirements, or evaluation criteria..."
          />
        </div>
      </div>
    </Modal>
  );
}
