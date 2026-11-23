import { AlertTriangle } from 'lucide-react';
import { SearchableMultiSelect, Spinner } from '../ui';
import { INCIDENT_CATEGORIES } from '../../utils/helpers';

export default function RedirectionReviewCard({
  incident,
  categoryOptions = INCIDENT_CATEGORIES,
  targetCategories,
  setTargetCategories,
  retainRequestingCategory,
  setRetainRequestingCategory,
  onApprove,
  onOpenRejectModal,
  isApproving,
}) {
  const requestedScope =
    incident?.redirect_requested_by_category ||
    incident?.redirect_requested_by_dept ||
    'Assigned Reviewer';

  return (
    <div className="card p-5 border-orange-200 bg-orange-50/20 print:hidden">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="text-orange-600 animate-pulse" size={18} />
        <h2 className="text-sm font-semibold text-slate-800">Redirection Request Review</h2>
      </div>

      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
        <p className="text-xs text-orange-800 font-semibold uppercase tracking-wider mb-1">
          Requested by reviewer for {requestedScope}
        </p>
        <p className="text-sm text-slate-700 italic">
          &ldquo;{incident?.redirect_reason || 'No reason provided.'}&rdquo;
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="field-label field-required mb-1.5 font-medium text-slate-700">
            Select Target Incident Categor(ies)
          </label>
          <SearchableMultiSelect
            options={categoryOptions}
            value={targetCategories}
            onChange={setTargetCategories}
            placeholder="Search and select one or more target incident categories…"
            searchPlaceholder="Search incident categories…"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            You can select multiple incident categories. Mapped staff assigned to each selected category will review and provide feedback.
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer select-none">
          <input
            type="checkbox"
            checked={retainRequestingCategory}
            onChange={(e) => setRetainRequestingCategory(e.target.checked)}
            className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
          />
          <span>Retain requesting reviewer scope alongside newly selected categories (joint review)</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onOpenRejectModal}
            className="btn-secondary flex items-center gap-2 border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 text-xs"
          >
            Reject Request
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={targetCategories.length === 0 || isApproving}
            className="btn-primary flex items-center gap-2 bg-orange-600 hover:bg-orange-700 border-orange-600 text-xs"
          >
            {isApproving && <Spinner size={14} className="text-white" />}
            Approve &amp; Redirect to Selected Categories
          </button>
        </div>
      </div>
    </div>
  );
}
