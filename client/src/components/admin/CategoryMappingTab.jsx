import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api';
import { Spinner, Modal, Alert, ConfirmDialog, EmptyState } from '../ui';
import EmployeeAutocomplete from './EmployeeAutocomplete';
import {
  Tag, Search, Plus, Edit3, UserMinus, CheckCircle2, AlertTriangle, X, RefreshCw
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
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'assigned' | 'unassigned'

  const [showMapModal, setShowMapModal] = useState(false);
  const [mapForm, setMapForm] = useState({ categoryId: '', employeeId: '', replaceExisting: true });
  const [removeTarget, setRemoveTarget] = useState(null);

  const {
    data: categories = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['category-mappings'],
    queryFn: () => adminApi.getCategoryMappings().then((r) => r.data || []),
  });

  const mapMutation = useMutation({
    mutationFn: (payload) => adminApi.mapCategoryFeedbackStaff(payload),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Category feedback staff assigned successfully.');
      setShowMapModal(false);
      setMapForm({ categoryId: '', employeeId: '', replaceExisting: true });
      qc.invalidateQueries({ queryKey: ['category-mappings'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['role-audit'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to assign category feedback staff')),
  });

  const removeMutation = useMutation({
    mutationFn: ({ mappingId, categoryId, userId }) =>
      adminApi.removeCategoryFeedbackStaff(mappingId || 'by-category', {
        categoryId,
        ...(userId ? { userId } : {}),
      }),
    onSuccess: (res) => {
      toast.success(res?.data?.message || 'Removed feedback staff from incident category.');
      setRemoveTarget(null);
      qc.invalidateQueries({ queryKey: ['category-mappings'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to remove feedback staff')),
  });

  const stats = useMemo(() => {
    const total = categories.length;
    const assigned = categories.filter((c) => Boolean(c.assigned_staff_name) || (c.assignees?.length || 0) > 0).length;
    return { total, assigned, unassigned: total - assigned };
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const term = tabSearch.trim().toLowerCase();
    return categories.filter((c) => {
      const assignees = Array.isArray(c.assignees) ? c.assignees : [];
      const isAssigned = Boolean(c.assigned_staff_name) || assignees.length > 0;
      if (statusFilter === 'assigned' && !isAssigned) return false;
      if (statusFilter === 'unassigned' && isAssigned) return false;
      if (!term) return true;
      if ((c.name || '').toLowerCase().includes(term)) return true;
      return assignees.some(
        (a) =>
          (a.full_name || '').toLowerCase().includes(term) ||
          (a.employee_id || '').toLowerCase().includes(term) ||
          (a.department || '').toLowerCase().includes(term)
      );
    });
  }, [categories, tabSearch, statusFilter]);

  const selectedCategory = useMemo(
    () => categories.find((c) => String(c.id) === String(mapForm.categoryId)),
    [categories, mapForm.categoryId]
  );

  const openMapModal = (categoryId = '', employeeId = '') => {
    setMapForm({
      categoryId: categoryId || categories[0]?.id || '',
      employeeId: employeeId || '',
      replaceExisting: true,
    });
    setShowMapModal(true);
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
              <h2 className="text-xl font-black text-slate-900">Category Feedback Mapping</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Assign the hospital staff member responsible for reviewing and providing feedback for each Incident Category. Any active staff member can be mapped — no HOD role is required.
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
                  {stats.unassigned} Pending Assignee
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <div className="relative flex-1 sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search category or staff..."
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
            <option value="all">All Categories ({stats.total})</option>
            <option value="assigned">Assigned ({stats.assigned})</option>
            <option value="unassigned">Unassigned ({stats.unassigned})</option>
          </select>
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
            message="Failed to fetch Incident Category feedback assignments. Please retry."
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
                <th className="py-3.5 pl-6 w-1/3">Incident Category</th>
                <th className="py-3.5 w-5/12">Assigned Feedback Staff</th>
                <th className="py-3.5 text-center">Mapping Status</th>
                <th className="py-3.5 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCategories.map((cat) => {
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

                return (
                  <tr key={cat.id} className="hover:bg-amber-50/20 transition-colors">
                    <td className="pl-6 py-4 align-top">
                      <p className="font-extrabold text-slate-900 text-sm">{cat.name}</p>
                      <span className="text-[10px] text-slate-400 font-mono">Category #{cat.id}</span>
                    </td>

                    <td className="py-4 align-top">
                      {primary ? (
                        <div className="space-y-2 max-w-[360px]">
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
                        <span className="text-xs italic text-slate-400">No feedback staff assigned yet</span>
                      )}
                    </td>

                    <td className="py-4 text-center align-top">
                      {primary ? (
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
                      {primary ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openMapModal(cat.id, primary.employee_id)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-600 hover:text-white text-slate-700 text-xs font-bold transition-all inline-flex items-center gap-1.5"
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
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                          >
                            <UserMinus size={12} /> Unassign
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openMapModal(cat.id, '')}
                          className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm"
                        >
                          <Plus size={13} /> Assign Staff
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Map / Change Category Staff Modal */}
      <Modal
        open={showMapModal}
        onClose={() => !mapMutation.isPending && setShowMapModal(false)}
        title={
          selectedCategory?.assigned_staff_name
            ? `Change Feedback Staff — ${selectedCategory.name}`
            : `Assign Feedback Staff — ${selectedCategory?.name || 'Incident Category'}`
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
              {selectedCategory?.assigned_staff_name ? 'Update Assignment' : 'Confirm Assignment'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert
            type="info"
            message="Designate the hospital staff member who will review and submit department-level feedback for incidents in this category. Any active employee can be assigned regardless of HOD status."
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
              {categories.map((c) => (
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
            selectedLabel="Selected Feedback Staff"
            accentColor="amber"
            helperText="Only active hospital staff are listed. Assigning staff keeps their existing portal role intact."
          />

          {selectedCategory?.assigned_staff_name && (
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={!mapForm.replaceExisting}
                onChange={(e) => setMapForm((f) => ({ ...f, replaceExisting: !e.target.checked }))}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <span>Add as an additional co-reviewer instead of replacing the current assignee</span>
            </label>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => !removeMutation.isPending && setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate(removeTarget);
        }}
        title="Remove Category Feedback Staff"
        message={
          removeTarget
            ? `Remove ${removeTarget.staffName} (${removeTarget.employeeId}) from "${removeTarget.categoryName}"? New incidents in this category will remain unassigned until another staff member is mapped.`
            : ''
        }
        confirmLabel={removeMutation.isPending ? 'Removing...' : 'Remove Assignment'}
        danger
      />
    </div>
  );
}
