import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { incidentsApi, metaApi } from '../../api';
import { INCIDENT_CATEGORY_MAPPING, INCIDENT_CATEGORIES, OCCURRED_TO_OPTIONS, SEVERITY_OPTIONS } from '../../utils/helpers';
import { Alert, Spinner, Modal, SearchableMultiSelect, SearchableSelect } from '../../components/ui';
import {
  ChevronRight, ChevronLeft, Check, MapPin, Calendar,
  FileText, Users, Eye, Layers, Tag, Upload, Paperclip, X, Download
} from 'lucide-react';
import toast from 'react-hot-toast';

const STEPS = [
  { id: 1, label: 'Category',       icon: Layers },
  { id: 2, label: 'Type',           icon: Tag },
  { id: 3, label: 'Date & Time',    icon: Calendar },
  { id: 4, label: 'Location',       icon: MapPin },
  { id: 5, label: 'Details',        icon: FileText },
  { id: 6, label: 'Accountability', icon: Users },
  { id: 7, label: 'Review',         icon: Eye },
];

export default function NewIncidentPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [duplicateAlert, setDuplicateAlert] = useState(null);

  // selectedCategories: string[]  (category names)
  // selectedTypes: { [category]: string }  (one type per category)
  const [form, setForm] = useState({
    selectedDepartments: [],
    selectedCategories: [],
    selectedTypes: {},       // { "Nursing Care Related": "Injury or fall of patient", ... }
    incidentDate: '',
    incidentTime: '',
    mainLocationId: '',
    subLocationId: '',
    occurredTo: '',
    severity: '',
    description: '',
    hasResponsiblePerson: false,
    responsiblePersonName: '',
    attachments: [],
  });
  const [previewFile, setPreviewFile] = useState(null);

  const { data: meta } = useQuery({
    queryKey: ['meta'],
    queryFn: () => metaApi.locations().then(r => r.data),
  });

  const { data: departmentsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => metaApi.departments().then(r => r.data),
  });
  const departmentOptions = (departmentsData || []).map(d => d.name);

  const submitMutation = useMutation({
    mutationFn: (data) => incidentsApi.create(data),
    onSuccess: (res) => {
      if (res.data.potentialDuplicate) {
        setDuplicateAlert(res.data);
      } else {
        toast.success(`Incident ${res.data.incident?.referenceId || res.data.referenceId || res.data.reference_id} submitted!`);
        navigate(`/incidents/${res.data.incident?.id || res.data.id}`);
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to submit incident');
    }
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const setType = (cat, type) => {
    setForm(f => ({ ...f, selectedTypes: { ...f.selectedTypes, [cat]: type } }));
  };


  const validate = () => {
    const e = {};
    if (step === 1 && form.selectedCategories.length === 0)
      e.selectedCategories = 'Select at least one incident category';

    if (step === 2) {
      form.selectedCategories.forEach(cat => {
        if (!form.selectedTypes[cat])
          e[`type_${cat}`] = `Select a type for "${cat}"`;
      });
    }

    if (step === 3) {
      if (!form.incidentDate) e.incidentDate = 'Date is required';
      if (form.incidentDate && new Date(form.incidentDate) > new Date())
        e.incidentDate = 'Date cannot be in the future';
      if (!form.incidentTime) e.incidentTime = 'Time is required';
    }

    if (step === 4) {
      if (!form.mainLocationId) e.mainLocationId = 'Select a location';
      if (!form.subLocationId)  e.subLocationId  = 'Sub-location is required';
    }

    if (step === 5) {
      if (!form.occurredTo)              e.occurredTo  = 'Required';
      if (!form.severity)                e.severity    = 'Required';
      if (!form.description.trim())      e.description = 'Description is required';
      if (form.description.length > 2000) e.description = 'Maximum 2000 characters';
    }

    if (step === 6) {
      if (form.hasResponsiblePerson && !form.responsiblePersonName.trim())
        e.responsiblePersonName = 'Name is required';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };
  const prev = () => setStep(s => s - 1);

  const handleSubmit = () => {
    // Build flat arrays for API
    const categories = form.selectedCategories;
    const types      = form.selectedCategories.map(c => form.selectedTypes[c]).filter(Boolean);

    const formData = new FormData();
    formData.append('incidentDate', form.incidentDate);
    formData.append('incidentTime', form.incidentTime);
    formData.append('mainLocationId', form.mainLocationId);
    formData.append('subLocationId', form.subLocationId);
    formData.append('occurredTo', form.occurredTo);
    formData.append('severity', form.severity);
    formData.append('incidentCategory', categories[0] || '');
    formData.append('incidentType', types[0] || '');
    formData.append('description', form.description);
    formData.append('hasResponsiblePerson', form.hasResponsiblePerson);
    formData.append('responsiblePersonName', form.responsiblePersonName);
    
    // Arrays need to be stringified for FormData if parsing as strings on backend
    formData.append('incidentCategories', JSON.stringify(categories));
    formData.append('incidentTypes', JSON.stringify(types));
    formData.append('departmentIds', JSON.stringify([]));
    formData.append('derivedDepartments', JSON.stringify(form.selectedDepartments));

    // Append attachments
    if (form.attachments && form.attachments.length > 0) {
      form.attachments.forEach(file => {
        formData.append('attachments', file);
      });
    }

    submitMutation.mutate(formData);
  };

  const subLocations = form.mainLocationId
    ? (meta?.subLocations || []).filter(s => s.main_location_id == form.mainLocationId)
    : [];

  return (
    <div className="w-full">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Report Incident</h1>
          <p className="page-subtitle">Step {step} of {STEPS.length}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="card p-4 mb-5">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`step-dot text-sm ${
                  s.id < step ? 'step-dot-done' : s.id === step ? 'step-dot-active' : 'step-dot-pending'
                }`}>
                  {s.id < step ? <Check size={14} /> : s.id}
                </div>
                <span className="text-[10px] text-slate-500 mt-1 hidden sm:block">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-1 ${s.id < step ? 'bg-green-500' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="card">
        <div className="p-5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            {(() => { const S = STEPS[step - 1]; return <S.icon size={17} className="text-blue-600" />; })()}
            <h2 className="text-sm font-semibold text-slate-800">{STEPS[step - 1].label}</h2>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* ── STEP 1: Incident Category ── */}
          {step === 1 && (
            <div>
              <label className="field-label field-required">Incident Category</label>
              <p className="text-xs text-slate-500 mb-3">
                Search and select all categories that apply. You will choose a specific type for each in the next step.
              </p>
              <SearchableMultiSelect
                options={INCIDENT_CATEGORIES}
                value={form.selectedCategories}
                onChange={(cats) => {
                  // Remove type entries for deselected categories
                  const newTypes = { ...form.selectedTypes };
                  Object.keys(newTypes).forEach(k => { if (!cats.includes(k)) delete newTypes[k]; });
                  setForm(f => ({ ...f, selectedCategories: cats, selectedTypes: newTypes }));
                }}
                placeholder="Click to search & select categories…"
                error={!!errors.selectedCategories}
              />
              {errors.selectedCategories && <p className="field-error">{errors.selectedCategories}</p>}

              {/* Preview of selected */}
              {form.selectedCategories.length > 0 && (
                <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-medium text-slate-500 mb-2">{form.selectedCategories.length} categor{form.selectedCategories.length === 1 ? 'y' : 'ies'} selected — you will pick a type for each on the next step</p>
                  <div className="flex flex-wrap gap-1.5">
                    {form.selectedCategories.map(cat => (
                      <span key={cat} className="badge badge-blue">{cat}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Incident Type per Category ── */}
          {step === 2 && (
            <div className="space-y-5">
              <p className="text-xs text-slate-500">
                For each category you selected, search and choose the specific incident type that best describes what happened.
              </p>
              {form.selectedCategories.map((cat, idx) => (
                <div key={cat}>
                  <label className="field-label field-required">
                    <span className="text-blue-700 font-semibold">#{idx + 1}</span>&nbsp;{cat}
                  </label>
                  <SearchableSelect
                    options={INCIDENT_CATEGORY_MAPPING[cat] || []}
                    value={form.selectedTypes[cat] || ''}
                    onChange={(type) => setType(cat, type)}
                    placeholder={`Search incident type for "${cat}"…`}
                    error={!!errors[`type_${cat}`]}
                  />
                  {errors[`type_${cat}`] && <p className="field-error">{errors[`type_${cat}`]}</p>}
                </div>
              ))}
            </div>
          )}

          {/* ── STEP 3: Date & Time ── */}
          {step === 3 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label field-required">Incident Date</label>
                <input
                  type="date"
                  value={form.incidentDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => set('incidentDate', e.target.value)}
                  className={`input ${errors.incidentDate ? 'input-error' : ''}`}
                />
                {errors.incidentDate && <p className="field-error">{errors.incidentDate}</p>}
              </div>
              <div>
                <label className="field-label field-required">Incident Time</label>
                <input
                  type="time"
                  value={form.incidentTime}
                  onChange={e => set('incidentTime', e.target.value)}
                  className={`input ${errors.incidentTime ? 'input-error' : ''}`}
                />
                {errors.incidentTime && <p className="field-error">{errors.incidentTime}</p>}
              </div>
            </div>
          )}

          {/* ── STEP 4: Location ── */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="field-label field-required">Main Location</label>
                <select
                  value={form.mainLocationId}
                  onChange={e => { set('mainLocationId', e.target.value); set('subLocationId', ''); }}
                  className={`select ${errors.mainLocationId ? 'input-error' : ''}`}
                >
                  <option value="">Select location…</option>
                  {(meta?.mainLocations || []).map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                {errors.mainLocationId && <p className="field-error">{errors.mainLocationId}</p>}
              </div>
              {form.mainLocationId && (
                <div>
                  <label className="field-label field-required">Sub-Location</label>
                  <select
                    value={form.subLocationId}
                    onChange={e => set('subLocationId', e.target.value)}
                    className={`select ${errors.subLocationId ? 'input-error' : ''}`}
                  >
                    <option value="">Select sub-location…</option>
                    {subLocations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  {errors.subLocationId && <p className="field-error">{errors.subLocationId}</p>}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 5: Details ── */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label field-required">Occurred To</label>
                  <select value={form.occurredTo} onChange={e => set('occurredTo', e.target.value)} className={`select ${errors.occurredTo ? 'input-error' : ''}`}>
                    <option value="">Select…</option>
                    {OCCURRED_TO_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                  {errors.occurredTo && <p className="field-error">{errors.occurredTo}</p>}
                </div>
                <div>
                  <label className="field-label field-required">Severity</label>
                  <select value={form.severity} onChange={e => set('severity', e.target.value)} className={`select ${errors.severity ? 'input-error' : ''}`}>
                    <option value="">Select…</option>
                    {SEVERITY_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                  {errors.severity && <p className="field-error">{errors.severity}</p>}
                </div>
              </div>

              {form.severity === 'Grave' && (
                <Alert type="warning" title="Grave Severity" message="This incident will be reviewed simultaneously by HOD and IMC to expedite resolution." />
              )}

              <div>
                <label className="field-label field-required">
                  Description
                  <span className="text-slate-400 font-normal ml-1">({form.description.length}/2000)</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Describe what happened, when, and any immediate actions taken…"
                  rows={5}
                  className={`textarea ${errors.description ? 'input-error' : ''}`}
                  maxLength={2000}
                />
                {errors.description && <p className="field-error">{errors.description}</p>}
              </div>

              {/* Attachments Section */}
              <div className="pt-2">
                <label className="field-label">
                  Attachments (Optional)
                  <span className="text-slate-400 font-normal ml-1">Images, PDFs, or Docs</span>
                </label>
                
                {form.attachments.length > 0 && (
                  <div className="flex flex-col gap-2 mb-3 mt-2">
                    {form.attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                            <Paperclip size={14} className="text-slate-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => setPreviewFile(file)}
                              className="text-sm font-medium text-blue-600 hover:underline truncate block text-left w-full"
                            >
                              {file.name}
                            </button>
                            <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => set('attachments', form.attachments.filter((_, i) => i !== idx))}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <input
                    type="file"
                    multiple
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        set('attachments', [...form.attachments, ...Array.from(e.target.files)]);
                      }
                      e.target.value = null; // Reset input so same file can be selected again
                    }}
                  />
                  <div className="flex flex-col items-center justify-center py-6 px-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-blue-400 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-2">
                      <Upload size={18} className="text-blue-600" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">Click or drag files here</p>
                    <p className="text-xs text-slate-500 mt-1 text-center">Max file size: 10MB per file</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 6: Accountability ── */}
          {step === 6 && (
            <div className="space-y-4">
              <div>
                <label className="field-label">Is anyone responsible for this incident?</label>
                <div className="flex gap-3 mt-2">
                  {[true, false].map(val => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => set('hasResponsiblePerson', val)}
                      className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                        form.hasResponsiblePerson === val
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-300 hover:border-blue-300 text-slate-700'
                      }`}
                    >
                      {val ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>
              {form.hasResponsiblePerson && (
                <div>
                  <label className="field-label field-required">Responsible Person's Name</label>
                  <input
                    value={form.responsiblePersonName}
                    onChange={e => set('responsiblePersonName', e.target.value)}
                    placeholder="Full name"
                    className={`input ${errors.responsiblePersonName ? 'input-error' : ''}`}
                  />
                  {errors.responsiblePersonName && <p className="field-error">{errors.responsiblePersonName}</p>}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 7: Review ── */}
          {step === 7 && (
            <div className="space-y-4">
              <Alert type="info" title="Review Before Submitting" message="Please verify all details. Once submitted, the incident cannot be edited." />

              <div className="space-y-3 divide-y divide-slate-100">
                {/* Categories & types */}
                <div className="flex gap-4 py-2.5 first:pt-0">
                  <span className="text-xs font-medium text-slate-500 w-36 flex-shrink-0 pt-0.5">Categories & Types</span>
                  <div className="flex-1 space-y-1">
                    {form.selectedCategories.map(cat => (
                      <div key={cat} className="text-sm text-slate-800">
                        <span className="font-medium text-blue-700">{cat}</span>
                        <span className="text-slate-400 mx-1">›</span>
                        <span>{form.selectedTypes[cat] || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <ReviewRow label="Date & Time" value={`${form.incidentDate} at ${form.incidentTime}`} />
                <ReviewRow
                  label="Location"
                  value={`${(meta?.mainLocations || []).find(l => l.id == form.mainLocationId)?.name || ''} › ${(meta?.subLocations || []).find(s => s.id == form.subLocationId)?.name || form.subLocationId}`}
                />
                <ReviewRow label="Occurred To" value={form.occurredTo} />
                <ReviewRow label="Severity" value={form.severity} highlight={form.severity === 'Grave'} />
                <ReviewRow label="Description" value={form.description} multiline />
                <ReviewRow
                  label="Responsible Person"
                  value={form.hasResponsiblePerson ? form.responsiblePersonName || '—' : 'None identified'}
                />
                <div className="flex gap-4 py-2.5">
                  <span className="text-xs font-medium text-slate-500 w-36 flex-shrink-0 pt-0.5">Attachments ({form.attachments.length})</span>
                  <div className="flex-1 space-y-1">
                    {form.attachments.length > 0 ? form.attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between w-full max-w-sm">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Paperclip size={12} className="text-slate-400 flex-shrink-0" />
                          <button
                            type="button"
                            onClick={() => setPreviewFile(file)}
                            className="text-sm font-medium text-blue-600 hover:underline text-left truncate"
                          >
                            {file.name}
                          </button>
                        </div>
                        <a 
                          href={URL.createObjectURL(file)} 
                          download={file.name}
                          className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                          title="Download"
                        >
                          <Download size={14} />
                        </a>
                      </div>
                    )) : <span className="text-sm text-slate-800">—</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button onClick={prev} disabled={step === 1} className="btn-secondary">
            <ChevronLeft size={16} />
            Back
          </button>
          {step < STEPS.length ? (
            <button onClick={next} className="btn-primary">
              Continue
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="btn-primary"
            >
              {submitMutation.isPending ? <Spinner size={16} className="text-white" /> : <Check size={16} />}
              {submitMutation.isPending ? 'Submitting…' : 'Submit Incident'}
            </button>
          )}
        </div>
      </div>

      {/* Duplicate alert modal */}
      <Modal
        open={!!duplicateAlert}
        onClose={() => {
          navigate(`/incidents/${duplicateAlert?.incident?.id}`);
          setDuplicateAlert(null);
        }}
        title="Potential Duplicate Detected"
        footer={
          <>
            <button
              onClick={() => { navigate(`/incidents/${duplicateAlert?.potentialDuplicate?.id}`); setDuplicateAlert(null); }}
              className="btn-secondary"
            >
              View Existing
            </button>
            <button
              onClick={() => { navigate(`/incidents/${duplicateAlert?.incident?.id}`); setDuplicateAlert(null); }}
              className="btn-primary"
            >
              View My Submission
            </button>
          </>
        }
      >
        <Alert
          type="warning"
          title="Similar incident detected"
          message={`A similar incident was recently filed. Your incident ${duplicateAlert?.incident?.referenceId} has been submitted. You can view the existing incident or continue with yours.`}
        />
      </Modal>

      {/* File Preview Modal */}
      <Modal
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.name || 'File Preview'}
        size="full"
        footer={
          <div className="flex justify-between w-full">
            {previewFile ? (
              <a 
                href={URL.createObjectURL(previewFile)} 
                download={previewFile.name}
                className="btn-primary flex items-center gap-2"
              >
                <Download size={16} />
                Download
              </a>
            ) : <div />}
            <button onClick={() => setPreviewFile(null)} className="btn-secondary">Close</button>
          </div>
        }
      >
        {previewFile && (
          <div className="flex justify-center bg-slate-900 rounded-xl overflow-hidden" style={{ minHeight: '50vh', maxHeight: '80vh' }}>
            {previewFile.type.startsWith('image/') ? (
              <img src={URL.createObjectURL(previewFile)} alt="Preview" className="w-full h-full object-contain" />
            ) : previewFile.type === 'application/pdf' ? (
              <iframe src={URL.createObjectURL(previewFile)} className="w-full h-[80vh]" title="PDF Preview" />
            ) : (
              <div className="p-8 text-center bg-white w-full flex flex-col items-center justify-center">
                <FileText size={48} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-600 font-medium mb-2">Preview not available</p>
                <a 
                  href={URL.createObjectURL(previewFile)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-primary inline-flex mt-2"
                >
                  Download / Open
                </a>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function ReviewRow({ label, value, multiline, highlight }) {
  return (
    <div className="flex gap-4 py-2.5 first:pt-0 last:pb-0">
      <span className="text-xs font-medium text-slate-500 w-36 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-slate-800 flex-1 ${multiline ? 'whitespace-pre-wrap' : ''} ${highlight ? 'font-semibold text-red-700' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}
