import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { Spinner, Modal, Alert, ConfirmDialog, EmptyState } from '../ui';
import EmployeeAutocomplete from './EmployeeAutocomplete';
import {
  Tag, Search, Plus, Edit3, UserMinus, CheckCircle2, AlertTriangle, X, RefreshCw,
  Trash2, RotateCcw, Archive, Pencil
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiErrorMessage } from '../../utils/helpers';

export default function CategoryMappingTab({
  masterEmployees = [],
  isLoadingMaster = false,
  tabSearch = '',
  onTabSearchChange,
}) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'assigned' | 'unassigned' | 'archived'

  const [showMapModal, setShowMapModal] = useState(false);
  const [mapForm, setMapForm] = useState({ categoryId: '', employeeId: '', replaceExisting: true });
  const [removeTarget, setRemoveTarget] = useState(null);

  // Category CRUD modal state
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [catNameInput, setCatNameInput] = useState('');
  const [catTypesList, setCatTypesList] = useState([]);
  const [newTypeInput, setNewTypeInput] = useState('');
  const [deleteCatTarget, setDeleteCatTarget] = useState(null);
  const [restoreCatTarget, setRestoreCatTarget] = useState(null);

  const {
    data: categories = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['category-mappings'],
    queryFn: () => adminApi.getCategoryMappings({ includeArchived: true }).then((r) => r.data || []),
  });

  const invalidateCategoryQueries = () => {
    qc.invalidateQueries({ queryKey: ['category-mappings'] });
    qc.invalidateQueries({ queryKey: ['categories'] });
    qc.invalidateQueries({ queryKey: ['incident-categories'] });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['master-employees'] });
    qc.invalidateQueries({ queryKey: ['incidents'] });
  };

  const mapMutation = useMutation({
    mutationFn: (payload) => adminApi.mapCategoryFeedbackStaff(payload),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Reviewer assigned successfully.');
      setShowMapModal(false);
      setMapForm({ categoryId: '', employeeId: '', replaceExisting: true });
      invalidateCategoryQueries();
      qc.invalidateQueries({ queryKey: ['role-audit'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to assign Reviewer')),
  });

  const removeMutation = useMutation({
    mutationFn: ({ mappingId, categoryId, userId }) =>
      adminApi.removeCategoryFeedbackStaff(mappingId || 'by-category', {
        categoryId,
        ...(userId ? { userId } : {}),
      }),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Removed Reviewer from incident category.');
      setRemoveTarget(null);
      invalidateCategoryQueries();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to remove Reviewer')),
  });

  const saveCategoryMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      id ? adminApi.updateCategory(id, payload) : adminApi.createCategory(payload),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Incident category saved successfully.');
      setCatModalOpen(false);
      setEditingCategory(null);
      setCatNameInput('');
      setCatTypesList([]);
      setNewTypeInput('');
      invalidateCategoryQueries();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to save incident category')),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id) => adminApi.deleteCategory(id),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Category removed.');
      setDeleteCatTarget(null);
      invalidateCategoryQueries();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to remove category')),
  });

  const restoreCategoryMutation = useMutation({
    mutationFn: (id) => adminApi.restoreCategory(id),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Category restored.');
      setRestoreCatTarget(null);
      invalidateCategoryQueries();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to restore category')),
  });

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active !== false),
    [categories]
  );

  const stats = useMemo(() => {
    const activeTotal = activeCategories.length;
    const assigned = activeCategories.filter((c) => Boolean(c.assigned_staff_name) || (c.assignees?.length || 0) > 0).length;
    const archived = categories.filter((c) => c.is_active === false).length;
    return { total: activeTotal, assigned, unassigned: activeTotal - assigned, archived };
  }, [categories, activeCategories]);

  const filteredCategories = useMemo(() => {
    const term = tabSearch.trim().toLowerCase();
    return categories.filter((c) => {
      const isArchived = c.is_active === false;
      if (statusFilter === 'archived') {
        if (!isArchived) return false;
      } else {
        if (isArchived) return false;
        const assignees = Array.isArray(c.assignees) ? c.assignees : [];
        const isAssigned = Boolean(c.assigned_staff_name) || assignees.length > 0;
        if (statusFilter === 'assigned' && !isAssigned) return false;
        if (statusFilter === 'unassigned' && isAssigned) return false;
      }

      if (!term) return true;
      if ((c.name || '').toLowerCase().includes(term)) return true;
      if (Array.isArray(c.incident_types) && c.incident_types.some((t) => (t || '').toLowerCase().includes(term))) {
        return true;
      }
      const assignees = Array.isArray(c.assignees) ? c.assignees : [];
      return assignees.some(
        (a) =>
          (a.full_name || '').toLowerCase().includes(term) ||
          (a.employee_id || '').toLowerCase().includes(term) ||
          (a.department || '').toLowerCase().includes(term)
      );
    });
  }, [categories, tabSearch, statusFilter]);

  const selectedCategory = useMemo(
    () => activeCategories.find((c) => String(c.id) === String(mapForm.categoryId)),
    [activeCategories, mapForm.categoryId]
  );

  const openMapModal = (categoryId = '', employeeId = '') => {
    setMapForm({
      categoryId: categoryId || activeCategories[0]?.id || '',
      employeeId: employeeId || '',
      replaceExisting: true,
    });
    setShowMapModal(true);
  };

  const openCreateCategoryModal = () => {
    setEditingCategory(null);
    setCatNameInput('');
    setCatTypesList([]);
    setNewTypeInput('');
    setCatModalOpen(true);
  };

  const openEditCategoryModal = (cat) => {
    setEditingCategory(cat);
    setCatNameInput(cat.name || '');
    const customTypes = (Array.isArray(cat.incident_types) ? cat.incident_types : []).filter(
      (t) => String(t || '').trim() && String(t).trim().toLowerCase() !== 'others'
    );
    setCatTypesList(customTypes);
    setNewTypeInput('');
    setCatModalOpen(true);
  };

  const handleAddTypeToDraft = () => {
    const clean = newTypeInput.trim();
    if (!clean) return;
    if (clean.toLowerCase() === 'others') {
      toast.error('"Others" is always included automatically.');
      setNewTypeInput('');
      return;
    }
    if (catTypesList.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      toast.error(`"${clean}" is already in the list.`);
      return;
    }
    setCatTypesList((prev) => [...prev, clean]);
    setNewTypeInput('');
  };

  const handleSubmitCategory = () => {
    const cleanName = catNameInput.trim();
    if (!cleanName) {
      toast.error('Category name is required.');
      return;
    }
    saveCategoryMutation.mutate({
      id: editingCategory?.id || null,
      payload: {
        name: cleanName,
        incidentTypes: [...catTypesList.map((t) => t.trim()).filter(Boolean), 'Others'],
      },
    });
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-md p-6 sm:p-8 animate-in fade-in duration-200">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Tag size={19} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Categories &amp; Reviewer Mapping</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Add, edit, or archive Incident Categories and their Incident Types, and designate the hospital Reviewers for each category.
              </p>
            </div>
          </div>
          {!isLoading && !isError && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {stats.assigned} / {stats.total} Categories Mapped
              </span>
              {stats.unassigned > 0 && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  {stats.unassigned} Pending Reviewer
                </span>
              )}
              {stats.archived > 0 && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  {stats.archived} Archived
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <div className="relative flex-1 sm:min-w-[210px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search category, type or staff..."
              value={tabSearch}
              onChange={(e) => onTabSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {tabSearch && (
              <button
                type="button"
                onClick={() => onTabSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select text-xs font-semibold py-2 rounded-xl border-slate-200 bg-slate-50"
          >
            <option value="all">All Active ({stats.total})</option>
            <option value="assigned">Assigned ({stats.assigned})</option>
            <option value="unassigned">Unassigned ({stats.unassigned})</option>
            {stats.archived > 0 && <option value="archived">Archived ({stats.archived})</option>}
          </select>
          <button
            type="button"
            onClick={openCreateCategoryModal}
            className="btn-primary text-xs py-2 px-3.5 rounded-xl flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} /> New Category
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Spinner size={32} />
        </div>
      ) : isError ? (
        <div className="space-y-3 py-6">
          <Alert
            type="error"
            title="Unable to Load Category Mappings"
            message="Failed to fetch Incident Category mappings. Please retry."
          />
          <button
            type="button"
            onClick={() => refetch()}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : filteredCategories.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No Matching Categories"
          message="No Incident Categories match your search or status filter."
          action={
            (tabSearch || statusFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  onTabSearchChange('');
                  setStatusFilter('all');
                }}
                className="btn-secondary text-xs"
              >
                Clear Filters
              </button>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200">
                <th className="py-3.5 pl-6 w-1/3">Incident Category &amp; Types</th>
                <th className="py-3.5 w-1/3">Assigned Reviewer(s)</th>
                <th className="py-3.5 text-center">Status</th>
                <th className="py-3.5 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCategories.map((cat) => {
                const isArchived = cat.is_active === false;
                const assignees = Array.isArray(cat.assignees) ? cat.assignees : [];
                const primary = assignees[0] || (cat.assigned_staff_name
                  ? {
                      mapping_id: cat.mapping_id,
                      user_id: cat.assigned_user_id,
                      employee_id: cat.assigned_employee_id,
                      full_name: cat.assigned_staff_name,
                      designation: cat.assigned_designation,
                      department: cat.assigned_department,
                    }
                  : null);
                const typesCount = Array.isArray(cat.incident_types) ? cat.incident_types.length : 1;

                return (
                  <tr key={cat.id} className={`transition-colors ${isArchived ? 'bg-slate-50/70 opacity-85' : 'hover:bg-amber-50/20'}`}>
                    <td className="pl-6 py-4 align-top">
                      <p className="font-extrabold text-slate-900 text-sm">{cat.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-slate-400 font-mono">#{cat.id}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {typesCount} {typesCount === 1 ? 'type' : 'types'}
                        </span>
                        {cat.incident_count > 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            {cat.incident_count} {cat.incident_count === 1 ? 'incident' : 'incidents'}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-4 align-top">
                      {isArchived ? (
                        <span className="text-xs italic text-slate-400">Archived (reviewers unassigned)</span>
                      ) : primary ? (
                        <div className="space-y-2 max-w-[340px]">
                          <div className="flex items-center gap-2.5 bg-slate-50/80 border border-slate-200/80 p-2.5 rounded-xl">
                            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 font-extrabold text-xs flex items-center justify-center flex-shrink-0">
                              {primary.full_name?.charAt(0) || 'S'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-800 truncate" title={primary.full_name}>
                                {primary.full_name}
                              </p>
                              <p className="text-[11px] font-mono text-slate-500 font-semibold">
                                ID: {primary.employee_id}
                              </p>
                              {(primary.designation || primary.department) && (
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                  {[primary.designation, primary.department].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                          </div>

                          {assignees.length > 1 && (
                            <div className="flex flex-wrap gap-1.5">
                              {assignees.slice(1).map((extra) => (
                                <span
                                  key={extra.mapping_id || extra.user_id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                                >
                                  +{extra.full_name} ({extra.employee_id})
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRemoveTarget({
                                        mappingId: extra.mapping_id,
                                        categoryId: cat.id,
                                        categoryName: cat.name,
                                        userId: extra.user_id,
                                        staffName: extra.full_name,
                                        employeeId: extra.employee_id,
                                      })
                                    }
                                    className="text-indigo-500 hover:text-red-600 ml-0.5"
                                    title={`Remove ${extra.full_name}`}
                                  >
                                    <X size={11} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs italic text-slate-400">No Reviewer assigned yet</span>
                      )}
                    </td>

                    <td className="py-4 text-center align-top">
                      {isArchived ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                          <Archive size={12} /> Archived
                        </span>
                      ) : primary ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={12} className="text-emerald-600" /> Assigned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle size={12} className="text-amber-600" /> Unassigned
                        </span>
                      )}
                    </td>

                    <td className="pr-6 py-4 text-right align-top">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {isArchived ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditCategoryModal(cat)}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all inline-flex items-center gap-1"
                              title="Edit Category Name & Types"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setRestoreCatTarget(cat)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all inline-flex items-center gap-1"
                            >
                              <RotateCcw size={12} /> Restore
                            </button>
                          </>
                        ) : (
                          <>
                            {primary ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openMapModal(cat.id, primary.employee_id)}
                                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-600 hover:text-white text-slate-700 text-xs font-bold transition-all inline-flex items-center gap-1"
                                >
                                  <Edit3 size={12} /> Change
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRemoveTarget({
                                      mappingId: primary.mapping_id,
                                      categoryId: cat.id,
                                      categoryName: cat.name,
                                      userId: assignees.length > 1 ? primary.user_id : undefined,
                                      staffName: primary.full_name,
                                      employeeId: primary.employee_id,
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 text-xs font-bold transition-all inline-flex items-center gap-1"
                                >
                                  <UserMinus size={12} /> Unassign
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openMapModal(cat.id, '')}
                                className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all inline-flex items-center gap-1 shadow-sm"
                              >
                                <Plus size={13} /> Assign Reviewer
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditCategoryModal(cat)}
                              className="p-1.5 rounded-xl bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 transition-all"
                              title="Edit Category & Incident Types"
                              aria-label={`Edit ${cat.name}`}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteCatTarget(cat)}
                              className="p-1.5 rounded-xl bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-700 transition-all"
                              title={cat.incident_count > 0 ? 'Archive Category' : 'Delete Category'}
                              aria-label={`Remove ${cat.name}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Map / Change Category Reviewer Modal */}
      <Modal
        open={showMapModal}
        onClose={() => !mapMutation.isPending && setShowMapModal(false)}
        title={
          selectedCategory?.assigned_staff_name
            ? `Change Reviewer — ${selectedCategory.name}`
            : `Assign Reviewer — ${selectedCategory?.name || 'Incident Category'}`
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowMapModal(false)}
              disabled={mapMutation.isPending}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                mapMutation.mutate({
                  categoryId: Number(mapForm.categoryId),
                  employeeId: mapForm.employeeId,
                  replaceExisting: mapForm.replaceExisting,
                })
              }
              disabled={!mapForm.categoryId || !mapForm.employeeId.trim() || mapMutation.isPending}
              className="btn-primary"
            >
              {mapMutation.isPending ? <Spinner size={15} className="text-white" /> : <CheckCircle2 size={15} />}
              {selectedCategory?.assigned_staff_name ? 'Update Reviewer' : 'Confirm Reviewer'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert
            type="info"
            message="Designate the hospital employee who will serve as Reviewer for incidents in this category. Any active employee can be assigned; being an HOD is not required and does not grant Reviewer access on its own."
          />

          {selectedCategory?.assigned_staff_name && (
            <div className="p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-200/80 text-amber-900 font-black text-xs flex items-center justify-center flex-shrink-0">
                  {selectedCategory.assigned_staff_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                    Currently Assigned:
                  </span>
                  <p className="text-xs font-bold text-slate-800 truncate">
                    {selectedCategory.assigned_staff_name}{' '}
                    {selectedCategory.assigned_employee_id && (
                      <span className="font-mono text-slate-500 font-normal">
                        (ID: {selectedCategory.assigned_employee_id})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="field-label field-required font-bold">Incident Category</label>
            <select
              value={mapForm.categoryId}
              onChange={(e) => setMapForm((f) => ({ ...f, categoryId: e.target.value, employeeId: '' }))}
              className="select w-full font-semibold"
            >
              <option value="">-- Choose Incident Category --</option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <EmployeeAutocomplete
            employees={masterEmployees}
            isLoading={isLoadingMaster}
            value={mapForm.employeeId}
            onChange={(empId) => setMapForm((f) => ({ ...f, employeeId: empId }))}
            label="Search & Select Active Staff Member"
            selectedLabel="Selected Reviewer"
            accentColor="amber"
            helperText="Only active hospital staff are listed. Assigning a Reviewer grants Reviewer View and category access immediately."
          />

          {selectedCategory?.assigned_staff_name && (
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={!mapForm.replaceExisting}
                onChange={(e) => setMapForm((f) => ({ ...f, replaceExisting: !e.target.checked }))}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <span>Add as an additional co-reviewer instead of replacing the current Reviewer</span>
            </label>
          )}
        </div>
      </Modal>

      {/* Add / Edit Category & Incident Types Modal */}
      <Modal
        open={catModalOpen}
        onClose={() => !saveCategoryMutation.isPending && setCatModalOpen(false)}
        title={editingCategory ? `Edit Category — ${editingCategory.name}` : 'Create New Incident Category'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setCatModalOpen(false)}
              disabled={saveCategoryMutation.isPending}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitCategory}
              disabled={!catNameInput.trim() || saveCategoryMutation.isPending}
              className="btn-primary"
            >
              {saveCategoryMutation.isPending ? <Spinner size={15} className="text-white" /> : <CheckCircle2 size={15} />}
              {editingCategory ? 'Save Changes' : 'Create Category'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="field-label field-required font-bold">Category Name</label>
            <input
              type="text"
              value={catNameInput}
              onChange={(e) => setCatNameInput(e.target.value)}
              placeholder="e.g. DNB Related"
              maxLength={120}
              className="input w-full"
            />
            {editingCategory && catNameInput.trim() && catNameInput.trim() !== editingCategory.name && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5">
                Renaming will automatically sync historical incident labels and analytics from &ldquo;{editingCategory.name}&rdquo; to &ldquo;{catNameInput.trim()}&rdquo;.
              </p>
            )}
          </div>

          <div>
            <label className="field-label font-bold">Incident Types</label>
            <p className="text-[11px] text-slate-500 mb-2">
              Sub-options shown in Step 1 when a staff member reports an incident under this category. &ldquo;Others&rdquo; is always included automatically.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTypeInput}
                onChange={(e) => setNewTypeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTypeToDraft();
                  }
                }}
                placeholder="Type a new Incident Type and press Add…"
                className="input flex-1 text-sm"
              />
              <button
                type="button"
                onClick={handleAddTypeToDraft}
                className="btn-secondary text-xs px-3 flex items-center gap-1"
              >
                <Plus size={13} /> Add
              </button>
            </div>

            <div className="mt-3 max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {catTypesList.map((typeName, idx) => (
                <div
                  key={`${idx}-${typeName}`}
                  className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                >
                  <input
                    type="text"
                    value={typeName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCatTypesList((prev) => prev.map((item, i) => (i === idx ? val : item)));
                    }}
                    className="bg-transparent text-xs font-medium text-slate-800 flex-1 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCatTypesList((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-600 p-0.5"
                    aria-label={`Remove ${typeName}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between bg-slate-100/80 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-500">
                <span className="font-medium">Others</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Always included</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => !removeMutation.isPending && setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate(removeTarget);
        }}
        title="Remove Category Reviewer"
        message={
          removeTarget
            ? `Remove ${removeTarget.staffName} (${removeTarget.employeeId}) from "${removeTarget.categoryName}"? New incidents in this category will remain unassigned until another Reviewer is mapped.`
            : ''
        }
        confirmLabel={removeMutation.isPending ? 'Removing...' : 'Remove Reviewer'}
        danger
      />

      <ConfirmDialog
        open={Boolean(deleteCatTarget)}
        onClose={() => !deleteCategoryMutation.isPending && setDeleteCatTarget(null)}
        onConfirm={() => {
          if (deleteCatTarget) deleteCategoryMutation.mutate(deleteCatTarget.id);
        }}
        title={deleteCatTarget?.incident_count > 0 ? 'Archive Incident Category' : 'Delete Incident Category'}
        message={
          deleteCatTarget
            ? deleteCatTarget.incident_count > 0
              ? `"${deleteCatTarget.name}" is referenced by ${deleteCatTarget.incident_count} incident(s). Removing it will archive the category (hiding it from new reporting and unassigning any Reviewers) while preserving all historical dossiers and analytics.`
              : `"${deleteCatTarget.name}" has zero linked incidents and will be permanently deleted. This action cannot be undone.`
            : ''
        }
        confirmLabel={
          deleteCategoryMutation.isPending
            ? 'Processing...'
            : deleteCatTarget?.incident_count > 0
              ? 'Archive Category'
              : 'Delete Category'
        }
        danger
      />

      <ConfirmDialog
        open={Boolean(restoreCatTarget)}
        onClose={() => !restoreCategoryMutation.isPending && setRestoreCatTarget(null)}
        onConfirm={() => {
          if (restoreCatTarget) restoreCategoryMutation.mutate(restoreCatTarget.id);
        }}
        title="Restore Archived Category"
        message={
          restoreCatTarget
            ? `Restore "${restoreCatTarget.name}" to active status so it becomes selectable in new incident reporting and Reviewer mapping?`
            : ''
        }
        confirmLabel={restoreCategoryMutation.isPending ? 'Restoring...' : 'Restore Category'}
      />
    </div>
  );
}
