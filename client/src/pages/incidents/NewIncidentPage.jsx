import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { incidentsApi, metaApi, employeeApi } from '../../api';
import {
  INCIDENT_CATEGORY_MAPPING, INCIDENT_CATEGORIES, OCCURRED_TO_OPTIONS, getApiErrorMessage
} from '../../utils/helpers';
import { Alert, Spinner, Modal, SearchableMultiSelect, SearchableSelect } from '../../components/ui';
import {
  ChevronRight, ChevronLeft, Check, Calendar,
  FileText, Users, Eye, Layers, Upload, Paperclip, X, Download,
  Search, UserPlus
} from 'lucide-react';
import toast from 'react-hot-toast';

const STEPS = [
  { id: 1, label: 'Category & Type',        icon: Layers },
  { id: 2, label: 'Date, Time & Location',  icon: Calendar },
  { id: 3, label: 'Details',                icon: FileText },
  { id: 4, label: 'Accountability',         icon: Users },
  { id: 5, label: 'Review',                 icon: Eye },
];

export default function NewIncidentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    selectedCategories: [],
    selectedTypes: {},
    incidentDate: '',
    incidentTime: '',
    mainLocationId: '',
    subLocationText: '',
    occurredTo: '',
    description: '',
    hasResponsiblePerson: false,
    responsiblePersonName: '',
    attachments: [],
  });
  const [previewFile, setPreviewFile] = useState(null);

  // Step 4: Searchable employee picker state
  const [selectedResponsibleEmployees, setSelectedResponsibleEmployees] = useState([]);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [employeeSearchResults, setEmployeeSearchResults] = useState([]);
  const [isSearchingEmployees, setIsSearchingEmployees] = useState(false);
  const [customPersonName, setCustomPersonName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const dateBounds = useMemo(() => {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    const max = new Date(now.getTime() - tzOffsetMs).toISOString().split('T')[0];
    const minDate = new Date(now);
    minDate.setDate(minDate.getDate() - 14);
    const min = new Date(minDate.getTime() - tzOffsetMs).toISOString().split('T')[0];
    return { min, max };
  }, []);

  // Manage preview Object URL cleanly without leaking memory
  const previewUrl = useMemo(() => (previewFile ? URL.createObjectURL(previewFile) : ''), [previewFile]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Manage attachment review download URLs safely
  const attachmentUrls = useMemo(
    () => form.attachments.map(file => ({ file, url: URL.createObjectURL(file) })),
    [form.attachments]
  );
  useEffect(() => {
    return () => {
      attachmentUrls.forEach(item => URL.revokeObjectURL(item.url));
    };
  }, [attachmentUrls]);

  useEffect(() => {
    const q = employeeSearchTerm.trim();
    if (!q || q.length < 2) return undefined;

    const timer = setTimeout(async () => {
      setIsSearchingEmployees(true);
      try {
        const res = await employeeApi.search(q);
        const list = Array.isArray(res.data) ? res.data : (res.data?.employees || []);
        setEmployeeSearchResults(list);
      } catch {
        setEmployeeSearchResults([]);
      } finally {
        setIsSearchingEmployees(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [employeeSearchTerm]);

  const updateResponsiblePersonNames = (list) => {
    const formatted = list.map(e => {
      if (e.is_custom) return e.full_name;
      const deptPart = e.department ? ` - ${e.department}` : '';
      return `${e.full_name} (${e.employee_id}${deptPart})`;
    }).join(', ');
    setForm(f => ({ ...f, responsiblePersonName: formatted }));
  };

  const addResponsibleEmployee = (emp) => {
    if (!selectedResponsibleEmployees.some(e => e.employee_id === emp.employee_id)) {
      const updated = [...selectedResponsibleEmployees, emp];
      setSelectedResponsibleEmployees(updated);
      updateResponsiblePersonNames(updated);
    }
    setEmployeeSearchTerm('');
    setEmployeeSearchResults([]);
  };

  const removeResponsibleEmployee = (key) => {
    const updated = selectedResponsibleEmployees.filter(e => e.employee_id !== key);
    setSelectedResponsibleEmployees(updated);
    updateResponsiblePersonNames(updated);
  };

  const addCustomPerson = () => {
    if (!customPersonName.trim()) return;
    const uniqueKey = `EXTERNAL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const customObj = {
      employee_id: uniqueKey,
      full_name: customPersonName.trim(),
      department: 'External / Non-Directory',
      is_custom: true,
    };
    const updated = [...selectedResponsibleEmployees, customObj];
    setSelectedResponsibleEmployees(updated);
    updateResponsiblePersonNames(updated);
    setCustomPersonName('');
    setShowCustomInput(false);
  };

  const { data: meta } = useQuery({
    queryKey: ['meta'],
    queryFn: () => metaApi.locations().then(r => r.data),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['incident-categories'],
    queryFn: () => metaApi.categories().then(r => r.data || []),
  });

  const categoryOptions = useMemo(() => {
    if (Array.isArray(categoriesData) && categoriesData.length > 0) {
      return categoriesData.filter(c => c.is_active !== false).map(c => c.name);
    }
    return INCIDENT_CATEGORIES;
  }, [categoriesData]);

  const submitMutation = useMutation({
    mutationFn: (data) => incidentsApi.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      const refId = res.data.incident?.referenceId || res.data.referenceId || res.data.reference_id;
      toast.success(`Incident ${refId} submitted!`);
      navigate(`/incidents/${res.data.incident?.id || res.data.id}`);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to submit incident'));
    },
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const setType = (cat, type) => {
    setForm(f => ({ ...f, selectedTypes: { ...f.selectedTypes, [cat]: type } }));
  };

  const validate = () => {
    const e = {};
    if (step === 1) {
      if (form.selectedCategories.length === 0) {
        e.selectedCategories = 'Select at least one incident category';
      } else {
        form.selectedCategories.forEach(cat => {
          if (!form.selectedTypes[cat]) {
            e[`type_${cat}`] = `Select an incident type for "${cat}"`;
          }
        });
      }
    }

    if (step === 2) {
      if (!form.incidentDate) {
        e.incidentDate = 'Date is required';
      } else {
        const parts = form.incidentDate.split('-').map(Number);
        const incDate = new Date(parts[0], parts[1] - 1, parts[2]);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const minAllowed = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14, 0, 0, 0, 0);

        if (incDate > today) {
          e.incidentDate = 'Incident date cannot be in the future';
        } else if (incDate < minAllowed) {
          e.incidentDate = 'Incidents must be reported within 14 days of occurrence. Incidents exceeding 14 days cannot be reported.';
        }
      }
      if (!form.incidentTime) e.incidentTime = 'Time is required';
      if (!form.mainLocationId) e.mainLocationId = 'Select a main location';
      if (!form.subLocationText || !form.subLocationText.trim()) e.subLocationText = 'Sub-location is required';
    }

    if (step === 3) {
      if (!form.occurredTo) e.occurredTo = 'Required';
      if (!form.description.trim()) e.description = 'Description is required';
      if (form.description.length > 2000) e.description = 'Maximum 2000 characters';
    }

    if (step === 4) {
      if (form.hasResponsiblePerson && !form.responsiblePersonName.trim()) {
        e.responsiblePersonName = 'Responsible person details are required';
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };
  const prev = () => setStep(s => s - 1);

  const handleSubmit = () => {
    const categories = form.selectedCategories;
    const types = form.selectedCategories.map(c => form.selectedTypes[c]).filter(Boolean);

    const formData = new FormData();
    formData.append('incidentDate', form.incidentDate);
    formData.append('incidentTime', form.incidentTime);
    formData.append('mainLocationId', form.mainLocationId);
    formData.append('subLocationText', form.subLocationText.trim());
    formData.append('occurredTo', form.occurredTo);
    formData.append('incidentCategory', categories[0] || '');
    formData.append('incidentType', types[0] || '');
    formData.append('description', form.description);
    formData.append('hasResponsiblePerson', form.hasResponsiblePerson);
    formData.append('responsiblePersonName', form.responsiblePersonName);

    formData.append('incidentCategories', JSON.stringify(categories));
    formData.append('incidentTypes', JSON.stringify(types));
    formData.append('categoryTypeMap', JSON.stringify(form.selectedTypes));

    if (form.attachments && form.attachments.length > 0) {
      form.attachments.forEach(file => {
        formData.append('attachments', file);
      });
    }

    submitMutation.mutate(formData);
  };

  const selectedMainLocationName =
    (meta?.mainLocations || []).find(l => String(l.id) === String(form.mainLocationId))?.name || '';

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
                <div
                  className={`step-dot text-sm ${
                    s.id < step ? 'step-dot-done' : s.id === step ? 'step-dot-active' : 'step-dot-pending'
                  }`}
                >
                  {s.id < step ? <Check size={14} /> : s.id}
                </div>
                <span className="text-[10px] text-slate-500 mt-1 hidden sm:block text-center">{s.label}</span>
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
            {(() => {
              const S = STEPS[step - 1];
              return <S.icon size={17} className="text-blue-600" />;
            })()}
            <h2 className="text-sm font-semibold text-slate-800">{STEPS[step - 1].label}</h2>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* ── STEP 1: Incident Category & Type ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="field-label field-required">Incident Category</label>
                <p className="text-xs text-slate-500 mb-3">
                  Search and select all incident categories that apply. Then choose the specific incident type for each selected category below.
                </p>
                <SearchableMultiSelect
                  options={categoryOptions}
                  value={form.selectedCategories}
                  onChange={(cats) => {
                    const newTypes = { ...form.selectedTypes };
                    Object.keys(newTypes).forEach(k => {
                      if (!cats.includes(k)) delete newTypes[k];
                    });
                    setForm(f => ({ ...f, selectedCategories: cats, selectedTypes: newTypes }));
                  }}
                  placeholder="Click to search & select categories…"
                  searchPlaceholder="Search categories…"
                  error={!!errors.selectedCategories}
                />
                {errors.selectedCategories && <p className="field-error">{errors.selectedCategories}</p>}
              </div>

              {form.selectedCategories.length > 0 && (
                <div className="pt-4 border-t border-slate-200 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Incident Type per Selected Category</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Choose the specific incident type that best describes what happened for each category.
                    </p>
                  </div>
                  {form.selectedCategories.map((cat, idx) => (
                    <div key={cat}>
                      <label className="field-label field-required">
                        <span className="text-blue-700 font-semibold">#{idx + 1}</span>&nbsp;{cat}
                      </label>
                      <SearchableSelect
                        options={INCIDENT_CATEGORY_MAPPING[cat] || ['Others']}
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
            </div>
          )}

          {/* ── STEP 2: Date, Time & Location ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label field-required">Incident Date</label>
                  <input
                    type="date"
                    value={form.incidentDate}
                    min={dateBounds.min}
                    max={dateBounds.max}
                    onChange={e => set('incidentDate', e.target.value)}
                    className={`input ${errors.incidentDate ? 'input-error' : ''}`}
                  />
                  {errors.incidentDate ? (
                    <p className="field-error">{errors.incidentDate}</p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1">Per policy, incidents must be reported within 14 days of occurrence.</p>
                  )}
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

              <div className="pt-4 border-t border-slate-200 space-y-4">
                <div>
                  <label className="field-label field-required">Main Location</label>
                  <select
                    value={form.mainLocationId}
                    onChange={e => set('mainLocationId', e.target.value)}
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
                    <label className="field-label field-required">Exact Sub-Location</label>
                    <input
                      type="text"
                      value={form.subLocationText}
                      onChange={e => set('subLocationText', e.target.value)}
                      placeholder="E.g., 2nd Floor, Room 102"
                      className={`input ${errors.subLocationText ? 'input-error' : ''}`}
                    />
                    {errors.subLocationText && <p className="field-error">{errors.subLocationText}</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3: Details ── */}
          {step === 3 && (
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
              </div>

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

              <div className="pt-2">
                <label className="field-label">
                  Attachments (Optional)
                  <span className="text-slate-400 font-normal ml-1">Images or PDFs</span>
                </label>

                {form.attachments.length > 0 && (
                  <div className="flex flex-col gap-2 mb-3 mt-2">
                    {form.attachments.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
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
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        const newFiles = Array.from(e.target.files);
                        const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
                        const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
                        const MAX_SIZE = 2 * 1024 * 1024;
                        const MAX_COUNT = 5;

                        const validFiles = [];
                        for (const file of newFiles) {
                          if (form.attachments.length + validFiles.length >= MAX_COUNT) {
                            toast.error(`Maximum ${MAX_COUNT} attachments permitted per incident.`);
                            break;
                          }
                          const ext = '.' + file.name.split('.').pop().toLowerCase();
                          const isAllowedExt = ALLOWED_EXT.includes(ext);
                          const isAllowedMime = !file.type || ALLOWED_MIME.includes(file.type);

                          if (!isAllowedExt || !isAllowedMime) {
                            toast.error(`"${file.name}" is not an allowed file type. Only JPG, PNG, WebP, and PDF are permitted.`);
                            continue;
                          }
                          if (file.size > MAX_SIZE) {
                            const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
                            toast.error(`"${file.name}" exceeds the 2MB size limit (${sizeMb} MB).`);
                            continue;
                          }
                          validFiles.push(file);
                        }

                        if (validFiles.length > 0) {
                          set('attachments', [...form.attachments, ...validFiles]);
                        }
                      }
                      e.target.value = null;
                    }}
                  />
                  <div className="flex flex-col items-center justify-center py-6 px-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-blue-400 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-2">
                      <Upload size={18} className="text-blue-600" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">Click or drag files here</p>
                    <p className="text-xs text-slate-500 mt-1 text-center">Max file size: 2MB per file (JPG, PNG, WebP, PDF) • Max 5 files</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 4: Accountability ── */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <label className="field-label">Is anyone responsible for this incident?</label>
                <div className="flex gap-3 mt-2">
                  {[true, false].map(val => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => {
                        set('hasResponsiblePerson', val);
                        if (!val) {
                          setSelectedResponsibleEmployees([]);
                          setForm(f => ({ ...f, responsiblePersonName: '' }));
                        }
                      }}
                      className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                        form.hasResponsiblePerson === val
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-slate-300 hover:border-blue-300 text-slate-700'
                      }`}
                    >
                      {val ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>

              {form.hasResponsiblePerson && (
                <div className="space-y-4 pt-1">
                  <div>
                    <label className="field-label field-required">
                      Select Responsible Employee(s)
                    </label>
                    <p className="text-xs text-slate-500 mb-2">
                      Search and select hospital staff by their Name or Employee ID. You can select multiple people if applicable.
                    </p>

                    <div className="relative">
                      <div className="relative">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={employeeSearchTerm}
                          onChange={e => {
                            const val = e.target.value;
                            setEmployeeSearchTerm(val);
                            if (val.trim().length < 2) {
                              setEmployeeSearchResults([]);
                              setIsSearchingEmployees(false);
                            }
                          }}
                          placeholder="Search employee by name or ID…"
                          className="input pl-10 pr-10 bg-white"
                        />
                        {isSearchingEmployees ? (
                          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                            <Spinner size={16} className="text-blue-600" />
                          </div>
                        ) : employeeSearchTerm ? (
                          <button
                            type="button"
                            onClick={() => { setEmployeeSearchTerm(''); setEmployeeSearchResults([]); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                          >
                            <X size={15} />
                          </button>
                        ) : null}
                      </div>

                      {employeeSearchResults.length > 0 && (
                        <div className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white rounded-xl shadow-xl border border-slate-200 divide-y divide-slate-100">
                          {employeeSearchResults.map((emp) => {
                            const isAlreadySelected = selectedResponsibleEmployees.some(
                              e => e.employee_id === emp.employee_id
                            );
                            return (
                              <button
                                key={emp.employee_id || emp.id}
                                type="button"
                                disabled={isAlreadySelected}
                                onClick={() => addResponsibleEmployee(emp)}
                                className={`w-full text-left p-3 flex items-center justify-between transition-colors ${
                                  isAlreadySelected
                                    ? 'bg-slate-50 opacity-60 cursor-not-allowed'
                                    : 'hover:bg-blue-50/70 cursor-pointer'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                    {(emp.full_name || emp.name || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-800 truncate flex items-center gap-2">
                                      <span>{emp.full_name || emp.name}</span>
                                      <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-normal">
                                        ID: {emp.employee_id}
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-500 truncate mt-0.5">
                                      {emp.designation || 'Staff'} {emp.department ? `· ${emp.department}` : ''}
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  {isAlreadySelected ? (
                                    <span className="text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-full border border-green-200">
                                      Selected
                                    </span>
                                  ) : (
                                    <span className="text-xs text-blue-600 font-semibold">+ Add</span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {employeeSearchTerm.trim().length >= 2 && !isSearchingEmployees && employeeSearchResults.length === 0 && (
                        <div className="absolute z-30 left-0 right-0 mt-1 p-4 bg-white rounded-xl shadow-lg border border-slate-200 text-center">
                          <p className="text-xs text-slate-500">No hospital employees matching &ldquo;{employeeSearchTerm}&rdquo;.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomPersonName(employeeSearchTerm);
                              setShowCustomInput(true);
                              setEmployeeSearchTerm('');
                            }}
                            className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
                          >
                            <UserPlus size={13} /> Add &ldquo;{employeeSearchTerm}&rdquo; as external/custom person
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedResponsibleEmployees.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-2">
                        Selected Responsible Personnel ({selectedResponsibleEmployees.length}):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {selectedResponsibleEmployees.map(emp => (
                          <div
                            key={emp.employee_id}
                            className="flex items-center justify-between p-2.5 rounded-xl border border-blue-200 bg-blue-50/60"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                                {emp.full_name?.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{emp.full_name}</p>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {emp.is_custom ? 'External' : `ID: ${emp.employee_id}`} {emp.department ? `· ${emp.department}` : ''}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeResponsibleEmployee(emp.employee_id)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 ml-2"
                              title="Remove"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-1">
                    {!showCustomInput ? (
                      <button
                        type="button"
                        onClick={() => setShowCustomInput(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1.5"
                      >
                        <UserPlus size={14} /> Add person not listed in directory (e.g. Visitor, Contractor, Third-Party)
                      </button>
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-700">Add External / Custom Person Name</label>
                          <button
                            type="button"
                            onClick={() => setShowCustomInput(false)}
                            className="text-xs text-slate-400 hover:text-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customPersonName}
                            onChange={e => setCustomPersonName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomPerson(); } }}
                            placeholder="Full name of person (e.g. Contractor, Visitor)…"
                            className="input text-xs flex-1 bg-white"
                          />
                          <button
                            type="button"
                            onClick={addCustomPerson}
                            disabled={!customPersonName.trim()}
                            className="btn-primary btn-sm flex-shrink-0"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {errors.responsiblePersonName && (
                    <p className="field-error">{errors.responsiblePersonName}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 5: Review ── */}
          {step === 5 && (
            <div className="space-y-4">
              <Alert type="info" title="Review Before Submitting" message="Please verify all details before submitting your incident report." />

              <div className="space-y-3 divide-y divide-slate-100">
                <div className="flex gap-4 py-2.5 first:pt-0">
                  <span className="text-xs font-medium text-slate-500 w-36 flex-shrink-0 pt-0.5">Categories &amp; Types</span>
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
                  value={
                    selectedMainLocationName
                      ? `${selectedMainLocationName}${form.subLocationText ? ` › ${form.subLocationText}` : ''}`
                      : form.subLocationText || '—'
                  }
                />
                <ReviewRow label="Occurred To" value={form.occurredTo} />
                <ReviewRow label="Description" value={form.description} multiline />
                <ReviewRow
                  label="Responsible Person"
                  value={form.hasResponsiblePerson ? form.responsiblePersonName || '—' : 'None identified'}
                />
                <div className="flex gap-4 py-2.5">
                  <span className="text-xs font-medium text-slate-500 w-36 flex-shrink-0 pt-0.5">Attachments ({form.attachments.length})</span>
                  <div className="flex-1 space-y-1">
                    {attachmentUrls.length > 0 ? attachmentUrls.map(({ file, url }, idx) => (
                      <div key={`${file.name}-${idx}`} className="flex items-center justify-between w-full max-w-sm">
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
                          href={url}
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

      {/* File Preview Modal */}
      <Modal
        open={!!previewFile}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.name || 'File Preview'}
        size="full"
        footer={
          <div className="flex justify-between w-full">
            {previewFile && previewUrl ? (
              <a
                href={previewUrl}
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
        {previewFile && previewUrl && (
          <div className="flex justify-center bg-slate-900 rounded-xl overflow-hidden" style={{ minHeight: '50vh', maxHeight: '80vh' }}>
            {previewFile.type.startsWith('image/') ? (
              <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
            ) : previewFile.type === 'application/pdf' ? (
              <iframe src={previewUrl} className="w-full h-[80vh]" title="PDF Preview" />
            ) : (
              <div className="p-8 text-center bg-white w-full flex flex-col items-center justify-center">
                <FileText size={48} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-600 font-medium mb-2">Preview not available</p>
                <a
                  href={previewUrl}
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

function ReviewRow({ label, value, multiline }) {
  return (
    <div className="flex gap-4 py-2.5 first:pt-0 last:pb-0">
      <span className="text-xs font-medium text-slate-500 w-36 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-slate-800 flex-1 ${multiline ? 'whitespace-pre-wrap' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}
