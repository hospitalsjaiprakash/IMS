import React, { useState, useEffect } from 'react';
import { 
  FileText, QrCode, Save, Send, AlertCircle, CheckCircle2, Building, 
  Printer, Eye, X, RefreshCw, ShieldAlert, Sparkles, ExternalLink, Mail, User, Briefcase 
} from 'lucide-react';
import { Modal, Spinner, Alert } from '../ui';
import { lettersApi } from '../../api';
import { convertNumberToWords, parseProposedOutcomes } from '../../utils/helpers';
import toast from 'react-hot-toast';

const LETTER_TYPES = [
  { value: 'warning_letter', label: 'Warning Letter', desc: 'Formal disciplinary notice regarding procedural lapse' },
  { value: 'warning_penalty_letter', label: 'Warning & Financial Penalty Letter', desc: 'Disciplinary warning with specified monetary deduction' },
  { value: 'advisory_letter', label: 'Advisory Letter', desc: 'Guidance and protocol adherence counsel' },
  { value: 'suggestion_letter', label: 'Suggestion Letter', desc: 'Process improvement and best-practice advisory' },
  { value: 'training_letter', label: 'Mandatory Training Directive Letter', desc: 'Compulsory competency and re-education directive' },
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
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [letterType, setLetterType] = useState('warning_letter');
  const [refNumber, setRefNumber] = useState('');
  const [letterDate, setLetterDate] = useState(new Date().toISOString().split('T')[0]);
  const [subject, setSubject] = useState('');
  const [bodyContent, setBodyContent] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [penaltyAmountWords, setPenaltyAmountWords] = useState('');
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
      
      setRecipientEmail(existingLetter.recipient_email || existingLetter.employee_email || '');
      setRecipientDepartment(existingLetter.recipient_department || existingLetter.employee_department || '');
      setRecipientDesignation(existingLetter.recipient_designation || existingLetter.employee_designation || '');

      setCcList(Array.isArray(existingLetter.cc_list || existingLetter.cc_recipients) ? (existingLetter.cc_list || existingLetter.cc_recipients) : []);
      setQrCodeUrl(existingLetter.qr_code_data || existingLetter.qr_code_url || '');
    } else {
      const targetEmp = initialEmployee?.employee_id || initialEmployee?.id || responsibleEmployees[0]?.employee_id || responsibleEmployees[0]?.id || '';
      setSelectedEmpId(targetEmp);

      // Determine recommended letter type from incident proposed outcome
      const outcome = (incident?.management_decision === 'DISAGREE_MODIFY' && incident?.proposed_outcome)
        ? incident.proposed_outcome
        : (incident?.proposed_outcome || '');
      const outLower = outcome.toLowerCase();
      let defaultType = 'warning_letter';
      if (outLower.includes('advisory')) defaultType = 'advisory_letter';
      else if (outLower.includes('suggestion')) defaultType = 'suggestion_letter';
      else if (outLower.includes('penalty') || outLower.includes('deduction')) defaultType = 'warning_penalty_letter';
      else if (outLower.includes('training') || outLower.includes('counselling')) defaultType = 'training_letter';

      setLetterType(defaultType);

      // Prefill management penalty amount if specified
      if (incident?.penalty_amount && (defaultType === 'warning_penalty_letter')) {
        setPenaltyAmount(String(incident.penalty_amount));
        setPenaltyAmountWords(incident.penalty_amount_words || convertNumberToWords(incident.penalty_amount));
      } else {
        setPenaltyAmount('');
        setPenaltyAmountWords('');
      }

      if (targetEmp) {
        loadDefaults(targetEmp, defaultType);
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
    loadDefaults(empId, letterType);
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
    try {
      await lettersApi.saveDraft(incident.id, {
        letterId: existingLetter?.id,
        employeeId: selectedEmpId,
        recipientName: selectedEmployeeObj.full_name || selectedEmployeeObj.name,
        recipientEmpNo: selectedEmployeeObj.employee_id || selectedEmployeeObj.emp_id,
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
      size="2xl"
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
        {approvedOutcomes.length > 0 && (
          <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} className="text-indigo-600" />
                Management Mandated Outcome(s):
              </span>
              <span className="text-[10px] text-indigo-600 font-medium">
                Click to switch template
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {approvedOutcomes.map((out, idx) => {
                const outLower = out.toLowerCase();
                let targetType = 'warning_letter';
                if (outLower.includes('advisory')) targetType = 'advisory_letter';
                else if (outLower.includes('suggestion')) targetType = 'suggestion_letter';
                else if (outLower.includes('penalty') || outLower.includes('deduction')) targetType = 'warning_penalty_letter';
                else if (outLower.includes('training') || outLower.includes('counselling')) targetType = 'training_letter';

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
                return (
                  <option key={idVal} value={idVal}>
                    {emp.full_name || emp.name} ({emp.employee_id || emp.emp_id || 'ID'}) — {emp.designation || 'Staff'} ({emp.department || emp.department_name || ''})
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
          <div className="bg-white border-2 border-slate-300 rounded-xl p-8 shadow-sm font-serif text-slate-800 space-y-6 max-h-[60vh] overflow-y-auto">
            {/* Hospital Header */}
            <div className="border-b-2 border-slate-800 pb-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Building className="text-slate-800" size={24} />
                <h1 className="text-xl font-bold tracking-wide uppercase text-slate-900">
                  Jai Prakash Hospital & Research Centre
                </h1>
              </div>
              <p className="text-[11px] font-sans text-slate-600 tracking-wider uppercase font-semibold">
                Incident Management Committee (IMC) • Quality & Patient Safety Division
              </p>
              <p className="text-[10px] font-sans text-slate-500 mt-0.5">
                JPHRC Campus, Main Road • Phone: +91-1234-567890 • Email: imc@jphrc.org
              </p>
            </div>

            {/* Reference Number & Date */}
            <div className="flex items-center justify-between text-xs font-sans font-semibold text-slate-700 border-b border-slate-100 pb-2">
              <div>
                Ref. No: <span className="font-mono text-slate-900 font-bold">{refNumber || 'JPHRC/IMC/PENDING'}</span>
              </div>
              <div>
                Date: <span className="text-slate-900">{letterDate}</span>
              </div>
            </div>

            {/* Addressed To */}
            <div className="text-xs font-sans space-y-0.5 text-slate-800">
              <p className="font-bold">To,</p>
              <p className="font-bold text-sm text-slate-900">
                {selectedEmployeeObj.full_name || selectedEmployeeObj.name || '[Employee Name]'}
              </p>
              <p className="text-slate-600">
                Employee ID: <span className="font-mono font-semibold">{selectedEmployeeObj.employee_id || selectedEmployeeObj.emp_id || '[Code]'}</span>
              </p>
              <p className="text-slate-600">
                Designation: <span className="font-semibold">{recipientDesignation || selectedEmployeeObj.designation || 'Staff'}</span>
              </p>
              <p className="text-slate-600">
                Department: <span className="font-semibold">{recipientDepartment || selectedEmployeeObj.department || selectedEmployeeObj.department_name || '[Department]'}</span>
              </p>
              {recipientEmail && (
                <p className="text-slate-500 text-[11px]">
                  Email: {recipientEmail}
                </p>
              )}
              <p className="text-slate-600">Jai Prakash Hospital & Research Centre</p>
            </div>

            {/* Subject */}
            <div className="text-xs font-sans font-bold text-slate-900 border-l-4 border-slate-800 pl-3 py-1 bg-slate-50">
              Subject: <u>{subject || '[Subject line pending]'}</u>
            </div>

            {/* Incident Context Badge */}
            <div className="text-[11px] font-sans bg-amber-50/70 border border-amber-200 rounded p-2 text-amber-900">
              <strong>Incident Reference:</strong> {incident?.reference_id} • Occurred on {incident?.incident_date}
            </div>

            {/* Body */}
            <div className="text-xs leading-relaxed text-slate-800 whitespace-pre-line font-serif space-y-3">
              {bodyContent || 'No letter content written yet. Switch to Editor to write content.'}
            </div>

            {/* Signatures */}
            <div className="pt-8 grid grid-cols-2 gap-4 text-xs font-sans">
              <div className="border-t border-slate-400 pt-2 text-left">
                <p className="font-bold text-slate-900">Incident Management Committee</p>
                <p className="text-[10px] text-slate-500">Convenor / Chairperson</p>
                <p className="text-[9px] text-slate-400">JPHRC Quality Assurance</p>
              </div>
              <div className="border-t border-slate-400 pt-2 text-right">
                <p className="font-bold text-slate-900">Executive Management</p>
                <p className="text-[10px] text-slate-500">Medical Superintendent / Director</p>
                <p className="text-[9px] text-slate-400">Jai Prakash Hospital & Research Centre</p>
              </div>
            </div>

            {/* Footer with CC and QR Code Callout */}
            <div className="border-t-2 border-slate-200 pt-4 flex items-end justify-between gap-4 font-sans text-[10px]">
              <div className="space-y-1 text-slate-600 flex-1">
                <p className="font-bold text-slate-800 uppercase tracking-wider text-[9px]">
                  Copy forwarded for information and necessary action to:
                </p>
                <ol className="list-decimal list-inside space-y-0.5">
                  {ccList.map((cc, i) => (
                    <li key={i}>{typeof cc === 'object' ? (cc.label || cc.name) : cc}</li>
                  ))}
                </ol>
              </div>

              {/* Dynamic Scannable QR Code */}
              <div className="shrink-0 flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-lg p-2 text-[9px] text-slate-600 max-w-[220px]">
                {qrCodeUrl ? (
                  <a
                    href={incidentUrl || `/incidents/${incident?.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Click or scan to verify incident on IMS portal"
                    className="shrink-0 group block"
                  >
                    <img
                      src={qrCodeUrl}
                      alt="IMS Incident Verification QR"
                      className="w-14 h-14 border border-slate-300 rounded shadow-xs group-hover:border-indigo-500 transition-colors"
                    />
                  </a>
                ) : (
                  <QrCode size={36} className="text-slate-800 shrink-0" />
                )}
                <div className="leading-tight">
                  <span className="font-bold text-slate-800 block">IMS Verification QR</span>
                  Scan or click to authenticate official record on IMS portal
                  {incidentUrl && (
                    <a
                      href={incidentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline flex items-center gap-0.5 mt-0.5 font-semibold text-[9px]"
                    >
                      Verify Link <ExternalLink size={9} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
