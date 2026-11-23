import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  FileText, Save, X, RefreshCw, ShieldAlert, Sparkles, Eye, User, GraduationCap
} from 'lucide-react';
import { Modal, Spinner } from '../ui';
import { lettersApi } from '../../api';
import { convertNumberToWords, parseProposedOutcomes, formatDate, getApiErrorMessage } from '../../utils/helpers';
import HospitalLetterhead from './HospitalLetterhead';
import toast from 'react-hot-toast';

const LETTER_TYPES = [
  { value: 'warning_letter', label: 'Warning Letter', desc: 'Formal disciplinary notice regarding procedural lapse' },
  { value: 'warning_penalty_letter', label: 'Warning & Financial Penalty Letter', desc: 'Disciplinary warning with specified monetary deduction' },
  { value: 'advisory_letter', label: 'Advisory Letter', desc: 'Guidance and protocol adherence counsel' },
  { value: 'suggestion_letter', label: 'Suggestion Letter', desc: 'Process improvement and best-practice advisory' },
  { value: 'custom_letter', label: 'Custom Official Communication', desc: 'Tailored executive resolution' },
];

export default function LetterDraftingModal({
  show,
  onClose,
  incident,
  responsibleEmployees = [],
  initialEmployee = null,
  existingLetter = null,
  existingLetters = [],
  onSaveSuccess
}) {
  const queryClient = useQueryClient();
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [letterType, setLetterType] = useState('warning_letter');
  const [refNumber, setRefNumber] = useState('');
  const [letterDate, setLetterDate] = useState(new Date().toISOString().split('T')[0]);
  const [subject, setSubject] = useState('');
  const [bodyContent, setBodyContent] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [penaltyAmountWords, setPenaltyAmountWords] = useState('');
  const [recipientEmpNo, setRecipientEmpNo] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientDepartment, setRecipientDepartment] = useState('');
  const [recipientDesignation, setRecipientDesignation] = useState('');
  const [ccList, setCcList] = useState([]);
  const [customCc, setCustomCc] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [incidentUrl, setIncidentUrl] = useState('');
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'preview'
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false);

  const loadDefaults = useCallback(async (empId, type, customPenalty = null) => {
    if (!incident?.id || !empId) return;
    setIsLoadingDefaults(true);
    try {
      const pAmt = customPenalty !== null ? customPenalty : (penaltyAmount || incident?.penalty_amount || '');
      const res = await lettersApi.getDefaults(incident.id, {
        employeeId: empId,
        templateType: type,
        letterType: type,
        penaltyAmount: pAmt
      });
      const def = res.data;
      if (def) {
        setRefNumber(def.referenceNumber || def.refNumber || '');
        setLetterDate(def.letterDate || new Date().toISOString().split('T')[0]);
        setSubject(def.subject || '');
        setBodyContent(def.bodyText || def.bodyContent || '');

        if (def.penaltyAmount !== undefined && def.penaltyAmount !== null && def.penaltyAmount !== '') {
          setPenaltyAmount(String(def.penaltyAmount));
        } else if (incident?.penalty_amount && (type === 'warning_penalty_letter' || type === 'warning_penalty')) {
          setPenaltyAmount(String(incident.penalty_amount));
        } else {
          setPenaltyAmount('');
        }

        if (def.penaltyAmountWords) {
          setPenaltyAmountWords(def.penaltyAmountWords);
        } else if (incident?.penalty_amount_words && (type === 'warning_penalty_letter' || type === 'warning_penalty')) {
          setPenaltyAmountWords(incident.penalty_amount_words);
        } else if (pAmt) {
          setPenaltyAmountWords(convertNumberToWords(pAmt));
        } else {
          setPenaltyAmountWords('');
        }

        if (def.recipientEmpNo && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(def.recipientEmpNo)) {
          setRecipientEmpNo(def.recipientEmpNo);
        }
        setRecipientEmail(def.recipientEmail || '');
        setRecipientDepartment(def.recipientDepartment || '');
        setRecipientDesignation(def.recipientDesignation || '');

        setCcList(def.ccRecipients || def.ccList || []);
        if (def.qrCodeUrl || def.qrCodeData) {
          setQrCodeUrl(def.qrCodeUrl || def.qrCodeData);
        }
        if (def.incidentUrl) {
          setIncidentUrl(def.incidentUrl);
        }
      }
    } catch (err) {
      console.error('Failed to load letter defaults:', err);
    } finally {
      setIsLoadingDefaults(false);
    }
  }, [incident, penaltyAmount]);

  // Initialize from existingLetter, initialEmployee, or first employee
  useEffect(() => {
    if (!show) return;

    const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());

    if (existingLetter) {
      setSelectedEmpId(existingLetter.employee_id || '');
      setLetterType(existingLetter.letter_type || existingLetter.template_type || 'warning_letter');
      setRefNumber(existingLetter.ref_number || existingLetter.reference_number || '');
      setLetterDate(existingLetter.letter_date?.split('T')[0] || new Date().toISOString().split('T')[0]);
      setSubject(existingLetter.subject || '');
      setBodyContent(existingLetter.body_content || existingLetter.body_text || '');
      
      const pAmt = existingLetter.penalty_amount ? String(existingLetter.penalty_amount) : '';
      setPenaltyAmount(pAmt);
      setPenaltyAmountWords(existingLetter.penalty_amount_words || (pAmt ? convertNumberToWords(pAmt) : ''));
      
      const rawEmpNo = existingLetter.recipient_emp_no || existingLetter.employee_code || existingLetter.employee_id;
      setRecipientEmpNo(rawEmpNo && !isUuid(rawEmpNo) ? rawEmpNo : '');
      setRecipientEmail(existingLetter.recipient_email || existingLetter.employee_email || '');
      setRecipientDepartment(existingLetter.recipient_department || existingLetter.employee_department || '');
      setRecipientDesignation(existingLetter.recipient_designation || existingLetter.employee_designation || '');

      setCcList(Array.isArray(existingLetter.cc_list || existingLetter.cc_recipients) ? (existingLetter.cc_list || existingLetter.cc_recipients) : []);
      setQrCodeUrl(existingLetter.qr_code_data || existingLetter.qr_code_url || '');
    } else {
      const targetEmpId = initialEmployee?.employee_id || initialEmployee?.id || responsibleEmployees[0]?.employee_id || responsibleEmployees[0]?.id || '';
      setSelectedEmpId(targetEmpId);

      const targetEmpObj = responsibleEmployees.find(e => (e.employee_id || e.id) === targetEmpId) || initialEmployee || {};
      const initialCode = targetEmpObj.emp_id || targetEmpObj.employee_code || targetEmpObj.employee_no || (targetEmpObj.employee_id && !isUuid(targetEmpObj.employee_id) ? targetEmpObj.employee_id : '');
      if (initialCode) setRecipientEmpNo(initialCode);
      const empOutcomes = (Array.isArray(targetEmpObj.outcomes) && targetEmpObj.outcomes.length > 0)
        ? targetEmpObj.outcomes
        : parseProposedOutcomes(incident?.proposed_outcome);

      const outJoined = empOutcomes.join(' ').toLowerCase();
      let defaultType = 'warning_letter';
      if (outJoined.includes('advisory')) defaultType = 'advisory_letter';
      else if (outJoined.includes('suggestion')) defaultType = 'suggestion_letter';
      else if (outJoined.includes('penalty') || outJoined.includes('deduction')) defaultType = 'warning_penalty_letter';

      setLetterType(defaultType);

      let empPenalty = null;
      if (targetEmpObj.penalty_amount) {
        empPenalty = String(targetEmpObj.penalty_amount);
      } else if (incident?.penalty_amount && defaultType === 'warning_penalty_letter') {
        empPenalty = String(incident.penalty_amount);
      }

      if (empPenalty) {
        setPenaltyAmount(empPenalty);
        setPenaltyAmountWords(targetEmpObj.penalty_amount_words || incident?.penalty_amount_words || convertNumberToWords(empPenalty));
      } else {
        setPenaltyAmount('');
        setPenaltyAmountWords('');
      }

      if (targetEmpId) {
        loadDefaults(targetEmpId, defaultType, empPenalty);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, existingLetter, initialEmployee, incident]);

  const handleEmployeeChange = (empId) => {
    setSelectedEmpId(empId);
    const emp = responsibleEmployees.find(e => (e.employee_id || e.id) === empId);
    let nextPenalty = null;
    let nextType = letterType;
    if (emp) {
      const code = emp.emp_id || emp.employee_code || emp.employee_no || (emp.employee_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(emp.employee_id) ? emp.employee_id : '');
      if (code) setRecipientEmpNo(code);
      if (emp.penalty_amount) {
        nextPenalty = String(emp.penalty_amount);
        setPenaltyAmount(nextPenalty);
        setPenaltyAmountWords(emp.penalty_amount_words || convertNumberToWords(nextPenalty));
      } else {
        setPenaltyAmount('');
        setPenaltyAmountWords('');
      }

      const empOutcomes = (Array.isArray(emp.outcomes) && emp.outcomes.length > 0)
        ? emp.outcomes
        : parseProposedOutcomes(incident?.proposed_outcome);
      const outJoined = empOutcomes.join(' ').toLowerCase();
      if (outJoined.includes('advisory')) nextType = 'advisory_letter';
      else if (outJoined.includes('suggestion')) nextType = 'suggestion_letter';
      else if (outJoined.includes('penalty') || outJoined.includes('deduction')) nextType = 'warning_penalty_letter';
      else if (outJoined.includes('warning')) nextType = 'warning_letter';
      setLetterType(nextType);
    }
    loadDefaults(empId, nextType, nextPenalty);
  };

  const handleTypeChange = (type) => {
    setLetterType(type);
    if (selectedEmpId) {
      loadDefaults(selectedEmpId, type);
    }
  };

  const handlePenaltyAmountChange = (newAmount) => {
    setPenaltyAmount(newAmount);
    const words = convertNumberToWords(newAmount);
    setPenaltyAmountWords(words);
  };

  const handleSyncPenaltyInBody = () => {
    if (!bodyContent) return;
    const num = penaltyAmount ? Number(penaltyAmount).toLocaleString('en-IN') : '0';
    const words = penaltyAmountWords || convertNumberToWords(penaltyAmount) || '';
    const penaltyPattern = /a penalty of ₹[0-9,]+(?:\/-)?\s*\([^)]*\)\s*will be deducted from your monthly salary/i;
    const replacement = `a penalty of ₹${num}/- (${words}) will be deducted from your monthly salary`;

    if (penaltyPattern.test(bodyContent)) {
      setBodyContent(bodyContent.replace(penaltyPattern, replacement));
      toast.success('Updated deduction amount inside letter text.');
    } else {
      setBodyContent(prev => `${prev}\n\nFurther, as recommended by the Incident Management Committee and approved by Management, ${replacement}.`);
      toast.success('Added deduction clause into letter text.');
    }
  };

  const handleAddCustomCc = (e) => {
    e.preventDefault();
    if (customCc.trim() && !ccList.includes(customCc.trim())) {
      setCcList([...ccList, customCc.trim()]);
      setCustomCc('');
    }
  };

  const handleRemoveCc = (item) => {
    setCcList(ccList.filter(c => c !== item));
  };

  const selectedEmployeeObj = responsibleEmployees.find(
    e => (e.employee_id || e.id) === selectedEmpId
  ) || {};

  // Find all letters already drafted for this specific employee
  const employeeDraftedLetters = (existingLetters || []).filter(
    l => (l.employee_id === selectedEmpId || l.recipient_name === (selectedEmployeeObj.full_name || selectedEmployeeObj.name)) && l.id !== existingLetter?.id
  );

  const approvedOutcomes = parseProposedOutcomes(incident?.proposed_outcome);
  const employeeOutcomes = (Array.isArray(selectedEmployeeObj.outcomes) && selectedEmployeeObj.outcomes.length > 0)
    ? selectedEmployeeObj.outcomes
    : approvedOutcomes;

  const handleSave = async () => {
    if (!selectedEmpId) {
      toast.error('Please select an employee for this letter.');
      return;
    }
    if (!subject.trim()) {
      toast.error('Please enter a subject.');
      return;
    }
    if (!bodyContent.trim()) {
      toast.error('Please enter the letter content.');
      return;
    }

    setIsSaving(true);
    const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
    const cleanEmpNo = recipientEmpNo || selectedEmployeeObj.emp_id || selectedEmployeeObj.employee_code || selectedEmployeeObj.employee_no || (selectedEmployeeObj.employee_id && !isUuid(selectedEmployeeObj.employee_id) ? selectedEmployeeObj.employee_id : '');

    try {
      await lettersApi.saveDraft(incident.id, {
        letterId: existingLetter?.id,
        employeeId: selectedEmpId,
        recipientName: selectedEmployeeObj.full_name || selectedEmployeeObj.name,
        recipientEmpNo: cleanEmpNo,
        recipientEmail: recipientEmail.trim() || null,
        recipientDepartment: recipientDepartment.trim() || null,
        recipientDesignation: recipientDesignation.trim() || null,
        templateType: letterType,
        letterType,
        refNumber,
        letterDate,
        subject,
        bodyContent,
        penaltyAmount: (letterType.includes('penalty') && penaltyAmount) ? parseFloat(penaltyAmount) : null,
        penaltyAmountWords: (letterType.includes('penalty')) ? penaltyAmountWords : null,
        ccList
      });

      toast.success(existingLetter ? 'Letter draft updated.' : 'Letter draft saved successfully.');
      queryClient.invalidateQueries({ queryKey: ['incident', String(incident?.id)] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save letter draft.'));
    } finally {
      setIsSaving(false);
    }
  };

  // Only show penalty box if template is a penalty template or user has entered penalty
  const showPenaltyBox = letterType.includes('penalty');

  return (
    <Modal
      open={show}
      onClose={onClose}
      title={existingLetter ? 'Edit Formal Letter Draft' : 'Draft Official Communication Letter'}
      size="full"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'editor' ? 'preview' : 'editor')}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              {activeTab === 'editor' ? <Eye size={14} /> : <FileText size={14} />}
              {activeTab === 'editor' ? 'Preview Official Letterhead' : 'Back to Editor'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoadingDefaults}
              className="btn-primary text-xs flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700"
            >
              {isSaving ? <Spinner size={14} className="text-white" /> : <Save size={14} />}
              {existingLetter ? 'Update Draft' : 'Save Letter Draft'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Recommended Outcomes Banner */}
        {employeeOutcomes.length > 0 && (
          <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} className="text-indigo-600" />
                {selectedEmployeeObj.full_name || selectedEmployeeObj.name ? (
                  <>Mandated Outcome(s) for <span className="underline decoration-indigo-400">{selectedEmployeeObj.full_name || selectedEmployeeObj.name}</span>:</>
                ) : (
                  <>Management Mandated Outcome(s):</>
                )}
              </span>
              <div className="flex items-center gap-2">
                {selectedEmployeeObj.penalty_amount && (
                  <span className="text-[11px] font-bold text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded border border-rose-200">
                    Individual Penalty: ₹{Number(selectedEmployeeObj.penalty_amount).toLocaleString('en-IN')}
                  </span>
                )}
                <span className="text-[10px] text-indigo-600 font-medium">
                  Click to switch template
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {employeeOutcomes.map((out, idx) => {
                const outLower = out.toLowerCase();
                const isTraining = outLower.includes('training') || outLower.includes('counselling');

                if (isTraining) {
                  return (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-xs"
                      title="Corrective Training is executed directly via Trainer Appointment under the Training & CAPA Protocol card."
                    >
                      <GraduationCap size={13} className="text-emerald-600" />
                      {out} <span className="text-[10px] text-emerald-600 font-normal">(Direct Trainer Mandate)</span>
                    </span>
                  );
                }

                let targetType = 'warning_letter';
                if (outLower.includes('advisory')) targetType = 'advisory_letter';
                else if (outLower.includes('suggestion')) targetType = 'suggestion_letter';
                else if (outLower.includes('penalty') || outLower.includes('deduction')) targetType = 'warning_penalty_letter';

                const isSelected = letterType === targetType;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleTypeChange(targetType)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                    }`}
                  >
                    {out}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Controls Bar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div>
            <label className="field-label field-required text-xs">Addressed Employee</label>
            <select
              value={selectedEmpId}
              onChange={(e) => handleEmployeeChange(e.target.value)}
              className="select w-full text-xs font-semibold"
              disabled={Boolean(existingLetter)}
            >
              <option value="">Select Responsible Employee...</option>
              {responsibleEmployees.map(emp => {
                const idVal = emp.employee_id || emp.id;
                const empCode = emp.emp_id || emp.employee_code || emp.employee_no || (emp.employee_id && emp.employee_id.length < 20 ? emp.employee_id : '') || '';
                return (
                  <option key={idVal} value={idVal}>
                    {emp.full_name || emp.name} {empCode ? `(${empCode})` : ''} — {emp.designation || 'Staff'} ({emp.department || emp.department_name || ''})
                  </option>
                );
              })}
            </select>

            {/* Indicator of existing letters for this employee */}
            {selectedEmpId && (
              <div className="mt-1.5 text-[11px]">
                {employeeDraftedLetters.length > 0 ? (
                  <div className="text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 space-y-1">
                    <span className="font-semibold block">Already drafted for this employee ({employeeDraftedLetters.length}):</span>
                    <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                      {employeeDraftedLetters.map(l => (
                        <li key={l.id}>
                          <strong>{l.ref_number || l.reference_number || 'Draft'}:</strong> {l.subject}
                        </li>
                      ))}
                    </ul>
                    <span className="text-[10px] text-amber-700 italic block">
                      💡 You are drafting an additional letter for this same employee.
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-500 text-[10px]">
                    No other letters drafted for this employee yet.
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="field-label field-required text-xs">Letter Template Type</label>
            <select
              value={letterType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="select w-full text-xs font-semibold text-slate-800"
            >
              {LETTER_TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              {LETTER_TYPES.find(t => t.value === letterType)?.desc}
            </p>
          </div>
        </div>

        {/* Recipient Details & Email Verification Card */}
        {selectedEmpId && (
          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <User size={13} className="text-slate-500" /> Recipient Details & Delivery Address
              </span>
              {!recipientEmail && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  ⚠️ Email missing — enter email to enable digital dispatch
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Designation</label>
                <input
                  type="text"
                  value={recipientDesignation}
                  onChange={e => setRecipientDesignation(e.target.value)}
                  className="input text-xs py-1"
                  placeholder="e.g. Staff Nurse / OT Tech"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Department</label>
                <input
                  type="text"
                  value={recipientDepartment}
                  onChange={e => setRecipientDepartment(e.target.value)}
                  className="input text-xs py-1"
                  placeholder="e.g. Critical Care / Nursing"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Email Address</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={e => setRecipientEmail(e.target.value)}
                  className={`input text-xs py-1 ${!recipientEmail ? 'border-amber-400 bg-amber-50/30' : ''}`}
                  placeholder="staff@jphrc.org"
                />
              </div>
            </div>
          </div>
        )}

        {isLoadingDefaults && (
          <div className="p-4 text-center text-xs text-indigo-600 flex items-center justify-center gap-2 bg-indigo-50/50 rounded-xl">
            <Spinner size={16} /> Loading template variables & default letterhead...
          </div>
        )}

        {/* Tab Toggle */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'editor'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText size={14} /> Letter Content Editor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'preview'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Eye size={14} /> Official Hospital Letterhead Preview
          </button>
        </div>

        {/* --- TAB 1: EDITOR --- */}
        {activeTab === 'editor' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="field-label text-xs">Reference Number</label>
                <input
                  type="text"
                  value={refNumber}
                  onChange={e => setRefNumber(e.target.value)}
                  className="input font-mono text-xs"
                  placeholder="JPHRC/IMC/2026/001"
                />
              </div>
              <div>
                <label className="field-label text-xs">Letter Date</label>
                <input
                  type="date"
                  value={letterDate}
                  onChange={e => setLetterDate(e.target.value)}
                  className="input text-xs"
                />
              </div>
            </div>

            {/* Financial Penalty Box (Pre-filled & Editable) */}
            {showPenaltyBox && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                    <ShieldAlert size={14} className="text-rose-600" />
                    Salary Deduction / Monetary Penalty Details
                  </span>
                  {incident?.penalty_amount && (
                    <span className="text-[11px] text-rose-700 bg-rose-100 px-2 py-0.5 rounded font-medium">
                      Executive Approved: ₹{incident.penalty_amount}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label text-[11px] text-rose-800 font-semibold">
                      Deduction Amount (₹) <span className="font-normal text-rose-600">(Editable)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={penaltyAmount}
                      onChange={e => handlePenaltyAmountChange(e.target.value)}
                      className="input text-xs font-bold text-rose-900"
                      placeholder="e.g. 1500"
                    />
                  </div>
                  <div>
                    <label className="field-label text-[11px] text-rose-800 font-semibold">
                      Amount in Words <span className="font-normal text-rose-600">(Auto-generated / Editable)</span>
                    </label>
                    <input
                      type="text"
                      value={penaltyAmountWords}
                      onChange={e => setPenaltyAmountWords(e.target.value)}
                      className="input text-xs italic"
                      placeholder="e.g. Rupees One Thousand Five Hundred only"
                    />
                  </div>
                </div>

                {penaltyAmount && (
                  <div className="flex items-center justify-between text-[11px] text-rose-800 pt-1 border-t border-rose-200">
                    <span className="font-medium">
                      {penaltyAmountWords || convertNumberToWords(penaltyAmount)}
                    </span>
                    <button
                      type="button"
                      onClick={handleSyncPenaltyInBody}
                      className="text-rose-700 hover:text-rose-900 font-semibold underline text-[10px] ml-auto flex items-center gap-1"
                    >
                      <RefreshCw size={11} /> Sync Clause in Body Text
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="field-label field-required text-xs">Subject Line</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="input text-xs font-semibold"
                placeholder="e.g. Warning Letter regarding equipment mishandling"
              />
            </div>

            <div>
              <label className="field-label field-required text-xs flex items-center justify-between">
                <span>Letter Body Content</span>
                <span className="text-[11px] font-normal text-slate-400">
                  Full official communication text
                </span>
              </label>
              <textarea
                value={bodyContent}
                onChange={e => setBodyContent(e.target.value)}
                rows={9}
                className="textarea font-sans text-xs leading-relaxed"
                placeholder="Write the full directive and observations..."
              />
            </div>

            {/* CC List Management */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="field-label text-xs">Copy Forwarded To (CC Recipients)</label>
              <div className="flex flex-wrap gap-1.5">
                {ccList.map((cc, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-700 shadow-2xs"
                  >
                    {typeof cc === 'object' ? (cc.label || cc.name || JSON.stringify(cc)) : cc}
                    <button
                      type="button"
                      onClick={() => handleRemoveCc(cc)}
                      className="text-slate-400 hover:text-rose-600 transition-colors ml-1"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={customCc}
                  onChange={e => setCustomCc(e.target.value)}
                  placeholder="Add another CC (e.g. Quality Head, Medical Superintendent, Accounts)…"
                  className="input text-xs flex-1"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomCc(e);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddCustomCc}
                  className="btn-secondary text-xs px-3"
                >
                  Add CC
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB 2: LIVE LETTERHEAD PREVIEW --- */}
        {activeTab === 'preview' && (
          <HospitalLetterhead
            refNumber={refNumber}
            letterDate={letterDate}
            recipientName={selectedEmployeeObj.full_name || selectedEmployeeObj.name}
            recipientEmpNo={
              recipientEmpNo ||
              selectedEmployeeObj.emp_id ||
              selectedEmployeeObj.employee_code ||
              selectedEmployeeObj.employee_no ||
              (selectedEmployeeObj.employee_id &&
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedEmployeeObj.employee_id)
                ? selectedEmployeeObj.employee_id
                : '')
            }
            recipientDepartment={recipientDepartment || selectedEmployeeObj.department || selectedEmployeeObj.department_name}
            recipientDesignation={recipientDesignation || selectedEmployeeObj.designation}
            subject={subject}
            salutation="Dear Staff,"
            bodyContent={bodyContent || 'No letter content written yet. Switch to Editor tab to write content.'}
            contextBanner={
              <>
                <strong>Incident Context:</strong> {incident?.reference_id} • Occurred on {formatDate(incident?.incident_date)}
              </>
            }
            penaltyAmount={penaltyAmount}
            penaltyAmountWords={penaltyAmountWords}
            status="draft"
            ccList={ccList}
            qrCodeUrl={qrCodeUrl}
            verifyUrl={incidentUrl || `${window.location.origin}/incidents/${incident?.id}`}
            maxDeskHeightClass="max-h-[70vh]"
          />
        )}
      </div>
    </Modal>
  );
}
