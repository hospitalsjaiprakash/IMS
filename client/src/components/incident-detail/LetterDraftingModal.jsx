import React, { useState, useEffect } from 'react';
import { FileText, QrCode, Save, Send, AlertCircle, CheckCircle2, Building, Printer, Eye, X } from 'lucide-react';
import { Modal, Spinner, Alert } from '../ui';
import { lettersApi } from '../../api';
import toast from 'react-hot-toast';

const LETTER_TYPES = [
  { value: 'advisory', label: 'Advisory Letter', desc: 'Guidance and protocol adherence counsel' },
  { value: 'suggestion', label: 'Suggestion Letter', desc: 'Process improvement and best-practice advisory' },
  { value: 'warning', label: 'Warning Letter', desc: 'Formal disciplinary notice regarding lapse' },
  { value: 'warning_penalty', label: 'Warning & Financial Penalty Letter', desc: 'Disciplinary warning with specified monetary deduction' },
  { value: 'training', label: 'Mandatory Training Letter', desc: 'Compulsory competency and re-education directive' },
  { value: 'custom', label: 'Custom Official Communication', desc: 'Tailored executive resolution' },
];

export default function LetterDraftingModal({
  show,
  onClose,
  incident,
  responsibleEmployees = [],
  existingLetter = null,
  onSaveSuccess
}) {
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [letterType, setLetterType] = useState('warning');
  const [refNumber, setRefNumber] = useState('');
  const [letterDate, setLetterDate] = useState(new Date().toISOString().split('T')[0]);
  const [subject, setSubject] = useState('');
  const [bodyContent, setBodyContent] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [penaltyAmountWords, setPenaltyAmountWords] = useState('');
  const [ccList, setCcList] = useState([]);
  const [customCc, setCustomCc] = useState('');
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'preview'
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false);

  // Initialize from existingLetter or first employee
  useEffect(() => {
    if (!show) return;

    if (existingLetter) {
      setSelectedEmpId(existingLetter.employee_id || '');
      setLetterType(existingLetter.letter_type || 'warning');
      setRefNumber(existingLetter.ref_number || '');
      setLetterDate(existingLetter.letter_date?.split('T')[0] || new Date().toISOString().split('T')[0]);
      setSubject(existingLetter.subject || '');
      setBodyContent(existingLetter.body_content || '');
      setPenaltyAmount(existingLetter.penalty_amount || '');
      setPenaltyAmountWords(existingLetter.penalty_amount_words || '');
      setCcList(Array.isArray(existingLetter.cc_list) ? existingLetter.cc_list : []);
    } else {
      const defaultEmp = responsibleEmployees[0]?.employee_id || responsibleEmployees[0]?.id || '';
      setSelectedEmpId(defaultEmp);
      // Determine default letter type from incident proposed outcome
      const outcome = (incident?.management_decision === 'DISAGREE_MODIFY' && incident?.proposed_outcome)
        ? incident.proposed_outcome
        : (incident?.proposed_outcome || '');
      const outLower = outcome.toLowerCase();
      let defaultType = 'warning';
      if (outLower.includes('advisory')) defaultType = 'advisory';
      else if (outLower.includes('suggestion')) defaultType = 'suggestion';
      else if (outLower.includes('penalty')) defaultType = 'warning_penalty';
      else if (outLower.includes('training') || outLower.includes('counselling')) defaultType = 'training';

      setLetterType(defaultType);
      if (defaultEmp) {
        loadDefaults(defaultEmp, defaultType);
      }
    }
  }, [show, existingLetter, incident]);

  const loadDefaults = async (empId, type) => {
    if (!incident?.id || !empId) return;
    setIsLoadingDefaults(true);
    try {
      const res = await lettersApi.getDefaults(incident.id, { employeeId: empId, letterType: type });
      const def = res.data;
      if (def) {
        setRefNumber(def.refNumber || '');
        setLetterDate(def.letterDate || new Date().toISOString().split('T')[0]);
        setSubject(def.subject || '');
        setBodyContent(def.bodyContent || '');
        setPenaltyAmount(def.penaltyAmount || '');
        setPenaltyAmountWords(def.penaltyAmountWords || '');
        setCcList(def.ccList || []);
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
        letterType,
        refNumber,
        letterDate,
        subject,
        bodyContent,
        penaltyAmount: penaltyAmount ? parseFloat(penaltyAmount) : null,
        penaltyAmountWords,
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
        {/* Top Controls Bar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div>
            <label className="field-label field-required text-xs">Addressed Employee</label>
            <select
              value={selectedEmpId}
              onChange={(e) => handleEmployeeChange(e.target.value)}
              className="select w-full text-xs"
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
          </div>

          <div>
            <label className="field-label field-required text-xs">Letter Template Type</label>
            <select
              value={letterType}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="select w-full text-xs"
            >
              {LETTER_TYPES.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

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

            {/* Financial Penalty Box (if applicable) */}
            {letterType === 'warning_penalty' && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-900">
                    Management Financial Penalty
                  </span>
                  {incident?.penalty_amount && (
                    <span className="text-[11px] text-rose-700 bg-rose-100 px-2 py-0.5 rounded font-medium">
                      Approved by Management: ₹{incident.penalty_amount}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="field-label text-[11px] text-rose-800">Deduction Amount (₹)</label>
                    <input
                      type="number"
                      value={penaltyAmount}
                      onChange={e => setPenaltyAmount(e.target.value)}
                      className="input text-xs"
                      placeholder="e.g. 1000"
                    />
                  </div>
                  <div>
                    <label className="field-label text-[11px] text-rose-800">Amount in Words</label>
                    <input
                      type="text"
                      value={penaltyAmountWords}
                      onChange={e => setPenaltyAmountWords(e.target.value)}
                      className="input text-xs"
                      placeholder="e.g. Rupees One Thousand only"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="field-label field-required text-xs">Subject Line</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="input text-xs font-semibold"
                placeholder="e.g. Advisory Letter regarding clinical handover documentation lapse"
              />
            </div>

            <div>
              <label className="field-label field-required text-xs flex items-center justify-between">
                <span>Letter Body Content</span>
                <span className="text-[11px] font-normal text-slate-400">
                  Markdown & paragraphs supported
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
              <label className="field-label text-xs">Copy To (CC Recipients)</label>
              <div className="flex flex-wrap gap-1.5">
                {ccList.map((cc, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-700 shadow-2xs"
                  >
                    {cc}
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
                  placeholder="Add another CC (e.g. Quality Head, Pharmacy Lead)..."
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
                Ref. No: <span className="font-mono text-slate-900">{refNumber || 'JPHRC/IMC/PENDING'}</span>
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
                Designation: <span className="font-semibold">{selectedEmployeeObj.designation || 'Staff'}</span>
              </p>
              <p className="text-slate-600">
                Department: <span className="font-semibold">{selectedEmployeeObj.department || selectedEmployeeObj.department_name || '[Department]'}</span>
              </p>
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
                    <li key={i}>{cc}</li>
                  ))}
                </ol>
              </div>

              {/* QR Code Container Preview */}
              <div className="shrink-0 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded p-2 text-[9px] text-slate-500 max-w-[200px]">
                <QrCode size={36} className="text-slate-800 shrink-0" />
                <div className="leading-tight">
                  <span className="font-bold text-slate-700 block">IMS Verification QR</span>
                  Scan to authenticate official record on IMS portal
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
