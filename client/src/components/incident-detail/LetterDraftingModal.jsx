import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  FileText, QrCode, Save, Send, AlertCircle, CheckCircle2, Building, 
  Printer, Eye, X, RefreshCw, ShieldAlert, Sparkles, ExternalLink, Mail, User, Briefcase, GraduationCap 
} from 'lucide-react';
import { Modal, Spinner, Alert } from '../ui';
import { lettersApi } from '../../api';
import { convertNumberToWords, parseProposedOutcomes, formatDate } from '../../utils/helpers';
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
  }, [show, existingLetter, initialEmployee, incident]);

  const loadDefaults = async (empId, type, customPenalty = null) => {
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
        } else if (penaltyAmount) {
          setPenaltyAmountWords(convertNumberToWords(penaltyAmount));
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
  };

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
      queryClient.invalidateQueries({ queryKey: ['incident', incident?.id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['all-incidents-analytics'] });
      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('Save draft error:', err);
      toast.error(err.response?.data?.error || 'Failed to save letter draft.');
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
                  placeholder="Add another CC (e.g. Quality Head, Medical Superintendent, HOD Accounts)..."
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
          <div className="bg-slate-300/80 -m-5 p-4 sm:p-8 flex justify-center overflow-y-auto max-h-[70vh]">
            {/* Authentic A4 Sheet (210mm x 297mm proportions) */}
            <div className="w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-800 shadow-[0_8px_30px_rgba(0,0,0,0.18),0_1px_4px_rgba(0,0,0,0.08)] border border-slate-300 relative flex flex-col justify-between select-text my-auto font-sans">
              
              {/* Central Watermark (60% width, 7% opacity) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img
                  src="/letterhead/jph-round-watermark.png"
                  alt="JPH Watermark"
                  className="w-[125mm] max-w-[58%] opacity-[0.07] object-contain select-none"
                />
              </div>

              {/* Draft Watermark Overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <span className="text-5xl font-black text-rose-500/[0.08] uppercase tracking-[0.35em] -rotate-45 select-none whitespace-nowrap">
                  DRAFT — FOR REVIEW
                </span>
              </div>

              {/* Top Section: Official Letterhead Header */}
              <div className="relative z-10 bg-white">
                {/* Top Green Band with Lime Wedge & White Accent */}
                <div className="relative w-full h-3 bg-[#146537] overflow-hidden">
                  <div className="absolute top-0 left-0 w-9 h-full bg-[#8DC63F] -skew-x-[35deg] -ml-2"></div>
                  <div className="absolute top-0 left-8 w-1.5 h-full bg-white -skew-x-[35deg]"></div>
                </div>

                {/* Header Content */}
                <div className="px-6 sm:px-[18mm] py-2.5 flex items-center justify-between border-b border-slate-200 bg-white">
                  {/* Brand Logo & Doc Control */}
                  <div className="flex flex-col justify-center">
                    <img
                      src="/letterhead/jph-header-logo.png"
                      alt="Jaiprakash Hospital"
                      className="h-10 object-contain object-left"
                    />
                    <div className="text-[9px] font-semibold text-slate-600 mt-1 tracking-tight">
                      Doc. No.: JPHRC/GNR/FRM/004A
                    </div>
                  </div>

                  {/* Hospital Info & NABH (Single Unit, Aligned to Right) */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Vertical Divider */}
                    <div className="w-[1.5px] h-14 bg-slate-300 shrink-0"></div>

                    {/* Contact Information */}
                    <div className="text-[8.5px] leading-[1.38] text-slate-700 whitespace-nowrap">
                      <div>
                        <span className="text-[#146537] font-bold">📍 Main Hospital :</span> Dayanand Nagar, Rourkela-769004, Odisha
                      </div>
                      <div>
                        <span className="text-[#146537] font-bold">📞 Helpline No. :</span> 9779 109 109
                      </div>
                      <div>✉️ info@jaiprakashhospitals.com</div>
                      <div>🌐 www.jaiprakashhospitals.com</div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        CIN : U85120OR2008PTC029111
                      </div>
                    </div>

                    {/* NABH Badge */}
                    <div className="shrink-0 pl-1">
                      <img
                        src="/letterhead/nabh-accredited-logo.svg"
                        alt="NABH Accredited"
                        className="h-14 w-auto object-contain"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Section: Printable Letter Body (18mm margins matching PDF) */}
              <div className="relative z-10 px-6 sm:px-[18mm] pt-4 pb-6 flex-1 flex flex-col justify-between text-[10pt] text-slate-800 leading-relaxed">
                <div className="space-y-3.5">
                  {/* Ref No & Date */}
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 text-[10pt] font-semibold text-slate-900">
                    <div>
                      Ref No: <span className="font-mono text-slate-900 font-bold">{refNumber || 'JPHRC/IMC/PENDING'}</span>
                    </div>
                    <div>
                      Date: <span className="text-slate-900">{letterDate}</span>
                    </div>
                  </div>

                  {/* Recipient Addressee Block */}
                  <div className="bg-[#f8fafc] border-l-[3.5px] border-[#146537] px-3.5 py-2 rounded text-[9.5pt] leading-[1.45] text-slate-800 space-y-0.5">
                    <p className="font-bold text-slate-900 text-[10pt]">To,</p>
                    <p className="font-bold text-[10.5pt] text-[#146537]">
                      {selectedEmployeeObj.full_name || selectedEmployeeObj.name || '[Employee Name]'}
                    </p>
                    {(recipientEmpNo || selectedEmployeeObj.emp_id || selectedEmployeeObj.employee_code || selectedEmployeeObj.employee_no || (selectedEmployeeObj.employee_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedEmployeeObj.employee_id) ? selectedEmployeeObj.employee_id : '')) && (
                      <p className="text-slate-600 font-medium text-[9pt]">
                        Emp. ID: <span className="font-mono text-slate-800">{recipientEmpNo || selectedEmployeeObj.emp_id || selectedEmployeeObj.employee_code || selectedEmployeeObj.employee_no || selectedEmployeeObj.employee_id}</span>
                      </p>
                    )}
                    <p className="text-slate-600 text-[9pt]">
                      Department: <span className="font-semibold text-slate-800">{recipientDepartment || selectedEmployeeObj.department || selectedEmployeeObj.department_name || '[Department]'}</span>
                      {(recipientDesignation || selectedEmployeeObj.designation) && (
                        <span> • Designation: <span className="font-semibold text-slate-800">{recipientDesignation || selectedEmployeeObj.designation}</span></span>
                      )}
                    </p>
                  </div>

                  {/* Subject */}
                  <div className="font-bold text-slate-900 text-[10pt]">
                    Subject: <u className="underline decoration-[#146537] underline-offset-3">{subject || '[Subject line pending]'}</u>
                  </div>

                  {/* Context Badge */}
                  <div className="text-[9pt] bg-amber-50 border border-amber-200 rounded p-2 text-amber-900">
                    <strong>Incident Context:</strong> {incident?.reference_id} • Occurred on {formatDate(incident?.incident_date)}
                  </div>

                  {/* Salutation */}
                  <div className="font-semibold text-slate-800 text-[10pt]">
                    Dear Staff,
                  </div>

                  {/* Body Paragraphs */}
                  <div className="space-y-2 text-[10pt] leading-[1.6] text-justify text-slate-800">
                    {(bodyContent || 'No letter content written yet. Switch to Editor tab to write content.')
                      .split(/\n\s*\n/)
                      .map((p, idx) => (
                        <p key={idx} className="whitespace-pre-line">
                          {p}
                        </p>
                      ))}
                  </div>

                  {/* Monetary Penalty Box (if applicable) */}
                  {penaltyAmount && (
                    <div className="my-3 bg-[#fff1f2] border border-[#fecdd3] border-l-4 border-l-[#e11d48] px-3.5 py-2.5 rounded text-[9.5pt] text-[#9f1239]">
                      <div className="font-bold">
                        Monetary Penalty Ordered: ₹{Number(penaltyAmount).toLocaleString('en-IN')} {penaltyAmountWords ? `(${penaltyAmountWords})` : ''}
                      </div>
                      <div className="text-[8pt] text-[#4c0519] mt-0.5">
                        Recovery shall be processed through Accounts / Payroll as per hospital disciplinary regulations.
                      </div>
                    </div>
                  )}
                </div>

                {/* Sign-off & CC Block */}
                <div className="mt-6 pt-3 space-y-3.5">
                  <div className="border-t border-slate-200 pt-2.5 space-y-0.5">
                    <div className="font-bold text-slate-900 text-[9.5pt]">By Order of,</div>
                    <div className="font-semibold text-slate-800 text-[9pt]">Incident Management Committee & Executive Management</div>
                    <div className="text-[8.5pt] text-slate-500">Jaiprakash Hospital and Research Centre Pvt. Ltd.</div>

                    <div className="inline-block mt-2 bg-amber-50 border border-amber-300 text-amber-800 px-2.5 py-1 rounded text-[7.5pt] font-semibold">
                      ⏳ Draft Directive — Pending Executive Management Approval
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-dashed border-slate-200 flex items-end justify-between gap-4 text-[8.5pt]">
                    <div className="flex-1 space-y-1 text-slate-600">
                      <div className="font-bold text-slate-700 uppercase tracking-wider text-[8pt]">
                        Copy Communicated for Information & Record To:
                      </div>
                      <ol className="list-decimal list-inside space-y-0.5 text-slate-600 text-[8pt]">
                        {ccList.map((cc, i) => (
                          <li key={i}>{typeof cc === 'object' ? (cc.label || cc.name) : cc}</li>
                        ))}
                      </ol>
                    </div>

                    {qrCodeUrl && (
                      <div className="shrink-0 text-center w-28">
                        <a
                          href={incidentUrl || `${window.location.origin}/incidents/${incident?.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block group transition-transform hover:scale-105"
                          title="Click to open Incident Dossier in IMS"
                        >
                          <img
                            src={qrCodeUrl}
                            alt="IMS QR Verification"
                            className="w-[96px] h-[96px] mx-auto border border-slate-300 rounded-md p-1 bg-white shadow-xs group-hover:border-[#146537] group-hover:shadow-md transition-all cursor-pointer"
                          />
                        </a>
                        <div className="text-[7pt] text-slate-500 mt-1 leading-tight">
                          Scan or click to verify incident dossier
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Section: Letterhead Footer */}
              <div className="relative z-10 bg-white border-t border-slate-200 mt-auto">
                <div className="px-6 sm:px-[18mm] py-2 text-[7pt] text-slate-600 space-y-0.5">
                  <div className="flex items-center gap-3">
                    <span>📍 <strong>City Centre,</strong> Ambedkar Chowk, Uditnagar, Rourkela-769012</span>
                    <span>📞 : 7606000999 / 7682860043</span>
                    <span>✉️ : citycentre@jaiprakashhospitals.com</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>📍 <strong>City Centre,</strong> Main Road, Rajgangpur-770017</span>
                    <span>📞 : 9078884831 / 9078884832</span>
                    <span>✉️ : citycentre.rgp@jaiprakashhospitals.com</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-dotted border-slate-200 text-[7pt] font-semibold text-slate-500">
                    <span>Ref: {refNumber || 'JPHRC/IMC/PENDING'}</span>
                    <span>Page 1 of 1 • Official Form: JPHRC/GNR/FRM/004A</span>
                  </div>
                </div>

                <div className="relative w-full h-[11px] bg-[#146537] overflow-hidden">
                  <div className="absolute top-0 left-0 w-8 h-full bg-[#8DC63F] -skew-x-[35deg] -ml-2"></div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
