import React from 'react';
import { Download, FileText, AlertCircle, Search, UserPlus, X, Shield, Users } from 'lucide-react';
import { Modal, Spinner, Alert } from '../../../components/ui';
import { UPLOADS_URL, API_BASE_URL, attachmentsApi } from '../../../api';
import { OCCURRED_TO_OPTIONS, SEVERITY_OPTIONS } from '../../../utils/helpers';
import FileUploadArea from '../FileUploadArea';

export function WithdrawModal({ show, onClose, withdrawReason, setWithdrawReason, mutate, isPending }) {
  return (
    <Modal open={show} onClose={onClose} title="Withdraw Incident" size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={mutate} disabled={!withdrawReason.trim() || isPending} className="btn-primary bg-red-600 hover:bg-red-700 border-red-600">
          {isPending && <Spinner size={15} className="text-white" />} Withdraw
        </button>
      </>}
    >
      <div>
        <label className="field-label field-required">Reason for withdrawal</label>
        <textarea
          value={withdrawReason}
          onChange={e => setWithdrawReason(e.target.value)}
          className="textarea"
          rows={3}
          placeholder="Please explain why you want to withdraw this incident..."
        />
      </div>
    </Modal>
  );
}

export function HodFeedbackModal({ show, onClose, feedbackText, setFeedbackText, hodAttachments, setHodAttachments, mutate, isPending, canHodFeedback }) {
  return (
    <Modal open={show} onClose={onClose} title="Submit Feedback" size="lg"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        {canHodFeedback && (
          <button
            onClick={mutate}
            disabled={!feedbackText.trim() || isPending}
            className="btn-primary"
          >
            {isPending && <Spinner size={15} className="text-white" />} Submit Feedback
          </button>
        )}
      </>}
    >
      <label className="field-label field-required">Feedback</label>
      <textarea
        value={feedbackText}
        onChange={e => setFeedbackText(e.target.value)}
        className="textarea"
        rows={5}
        placeholder="Provide your detailed review and recommendations…"
      />
      <FileUploadArea files={hodAttachments} setFiles={setHodAttachments} />
    </Modal>
  );
}

export function ManagementDecisionModal({ show, onClose, mdActions, setMdActions, mdAttachments, setMdAttachments, mdProposedOutcome, setMdProposedOutcome, incidentProposedOutcome, mutate, isPending }) {
  const [decision, setDecision] = React.useState('AGREE');

  React.useEffect(() => {
    if (!show) {
      setDecision('AGREE');
    } else {
      if (!mdProposedOutcome && incidentProposedOutcome) {
        setMdProposedOutcome(incidentProposedOutcome);
      }
    }
  }, [show]);

  return (
    <Modal open={show} onClose={onClose} title="Management Action" size="lg"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={() => mutate(decision)}
          disabled={
            isPending ||
            (['DISAGREE_REINVESTIGATE', 'DISAGREE_REVISE_FEEDBACK'].includes(decision) ? !mdActions?.trim() : (decision === 'DISAGREE_MODIFY' && !mdProposedOutcome))
          }
          className="btn-primary"
        >
          {isPending && <Spinner size={15} className="text-white" />} Submit Decision
        </button>
      </>}
    >
      <div className="space-y-4">
        <div>
          <label className="field-label field-required">Decision</label>
          <select value={decision} onChange={e => setDecision(e.target.value)} className="input">
            <option value="AGREE">Approve / Agree with IMC</option>
            <option value="DISAGREE_MODIFY">Modify Proposed Outcomes</option>
            <option value="DISAGREE_REINVESTIGATE">Reject & Re-investigate</option>
            <option value="DISAGREE_REVISE_FEEDBACK">Reject & Request Revised Feedback</option>
          </select>
        </div>

        {(decision === 'DISAGREE_REINVESTIGATE' || decision === 'DISAGREE_REVISE_FEEDBACK') ? (
          <div>
            <label className="field-label field-required">{decision === 'DISAGREE_REINVESTIGATE' ? 'Re-investigation' : 'Revision'} Notes / Reason</label>
            <textarea value={mdActions} onChange={e => setMdActions(e.target.value)} className="textarea" rows={5} placeholder="Describe why this incident needs further review..." />
          </div>
        ) : (
          <>
            {decision === 'DISAGREE_MODIFY' && (
              <div>
                <label className="field-label field-required">Modified Proposed Outcome</label>
                <select
                  value={mdProposedOutcome}
                  onChange={(e) => setMdProposedOutcome(e.target.value)}
                  className="select w-full"
                >
                  <option value="">Select Relevant Option</option>
                  <option value="No Action">No Action</option>
                  <option value="Counselling / Education / Training">Counselling / Education / Training</option>
                  <option value="Issue a Warning Letter">Issue a Warning Letter</option>
                  <option value="Issue an Advisory Letter">Issue an Advisory Letter</option>
                  <option value="Financial Penalty">Financial Penalty</option>
                  <option value="Suspension for a Stipulated Period">Suspension for a Stipulated Period</option>
                  <option value="Transfer to Other Dept.">Transfer to Other Dept.</option>
                  <option value="Demotion">Demotion</option>
                  <option value="Termination">Termination</option>
                  <option value="Legal Action">Legal Action</option>
                  <option value="Disciplinary Committee">Disciplinary Committee</option>
                  <option value="Conflict Resolution Committee">Conflict Resolution Committee</option>
                  <option value="New Protocol and Process Flow">New Protocol and Process Flow</option>
                  <option value="Modifying Protocol and Process Flow">Modifying Protocol and Process Flow</option>
                  <option value="Inappropriate Complaint">Inappropriate Complaint</option>
                  <option value="Others">Others</option>
                </select>
              </div>
            )}
            <div>
              <label className="field-label">Corrective Actions / Notes (Optional)</label>
              <textarea
                value={mdActions}
                onChange={e => setMdActions(e.target.value)}
                className="textarea"
                rows={4}
                placeholder="Describe any corrective actions taken, recommended, or internal notes (optional)…"
              />
            </div>
            
            <FileUploadArea files={mdAttachments} setFiles={setMdAttachments} />
          </>
        )}
      </div>
    </Modal>
  );
}

export function ReopenModal({ show, onClose, reopenReason, setReopenReason, mutate, isPending }) {
  return (
    <Modal open={show} onClose={onClose} title="Reopen Incident"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={mutate} disabled={!reopenReason.trim() || isPending} className="btn-primary">
          {isPending && <Spinner size={15} className="text-white" />} Confirm Reopen
        </button>
      </>}
    >
      <div className="space-y-4">
        <Alert type="warning" message="Reopening this incident will send it back to the IMC queue." />
        <div>
          <label className="field-label field-required">Reason for Reopening</label>
          <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} className="textarea" rows={3} placeholder="Provide a reason..." />
        </div>
      </div>
    </Modal>
  );
}

export function ImcReportModal({ show, onClose, attachments, setAttachments, mutate, isPending }) {
  return (
    <Modal open={show} onClose={onClose} title="Generate Official IMC Report"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={mutate} disabled={isPending} className="btn-primary">
          {isPending && <Spinner size={15} className="text-white" />} Generate Report
        </button>
      </>}
    >
      <div className="space-y-4">
        <Alert type="info" message="Upload the official IMC report document (PDF recommended) based on the Management's decision." />
        
        <FileUploadArea files={attachments} setFiles={setAttachments} />
      </div>
    </Modal>
  );
}

export function RedirectIncidentModal({ show, onClose, redirectReason, setRedirectReason, mutate, isPending }) {
  return (
    <Modal open={show} onClose={onClose} title="Request Redirection to IMC"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={mutate}
          disabled={!redirectReason.trim() || isPending}
          className="btn-danger bg-orange-600 hover:bg-orange-700 border-orange-600 focus:ring-orange-500"
        >
          {isPending && <Spinner size={15} className="text-white" />} Request Redirection
        </button>
      </>}
    >
      <Alert type="warning" message="This action will flag this incident as misrouted. The Incident Management Committee (IMC) will review your request and route it to the correct department HOD." className="mb-4" />
      <label className="field-label field-required">Reason for redirection request</label>
      <textarea
        value={redirectReason}
        onChange={e => setRedirectReason(e.target.value)}
        className="textarea"
        rows={4}
        placeholder="Please explain why this incident is not for your department, and suggest the correct department if possible…"
      />
    </Modal>
  );
}

export function RejectRedirectModal({ show, onClose, rejectRedirectReason, setRejectRedirectReason, mutate, isPending }) {
  return (
    <Modal open={show} onClose={onClose} title="Reject Redirection Request"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={mutate}
          disabled={!rejectRedirectReason.trim() || isPending}
          className="btn-danger focus:ring-red-500"
        >
          {isPending && <Spinner size={15} className="text-white" />} Reject Request
        </button>
      </>}
    >
      <Alert type="warning" message="This will return the incident to the original department HOD for action." className="mb-4" />
      <label className="field-label field-required">Reason for Rejection</label>
      <textarea
        value={rejectRedirectReason}
        onChange={e => setRejectRedirectReason(e.target.value)}
        className="textarea"
        rows={4}
        placeholder="Please explain why the redirection request is denied..."
      />
    </Modal>
  );
}

export function EditFeedbackModal({ editFbModal, onClose, editFbText, setEditFbText, mutate, isPending }) {
  return (
    <Modal
      open={!!editFbModal}
      onClose={onClose}
      title={editFbModal ? `Edit ${editFbModal.feedbackType.replace('head_management', 'Management').replace('hod', 'HOD').replace('imc', 'IMC').toUpperCase()} Feedback` : ''}
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            disabled={isPending || !editFbText.trim()}
            onClick={() => mutate({ feedbackType: editFbModal.feedbackType, feedbackText: editFbText, feedbackId: editFbModal.feedbackId })}
            className="btn-primary disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      {editFbModal && (
        <div className="space-y-4 pt-1">
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700">
              You are editing your own <strong>{editFbModal.feedbackType.replace('head_management', 'Management').replace('hod', 'HOD').replace('imc', 'IMC')}</strong> feedback.
              This change will be recorded in the audit trail.
            </p>
          </div>
          <div>
            <label className="field-label field-required">Corrected Feedback</label>
            <textarea
              rows={5}
              value={editFbText}
              onChange={e => setEditFbText(e.target.value)}
              className="textarea"
              placeholder="Update your feedback…"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

export function EditIncidentModal({ show, onClose, editInc, setEditInc, mutate, isPending }) {
  const handleSave = () => {
    if (editInc.incidentDate) {
      const parts = editInc.incidentDate.split('-').map(Number);
      const incDate = new Date(parts[0], parts[1] - 1, parts[2]);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const minAllowed = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14, 0, 0, 0, 0);

      if (incDate > today) {
        toast.error('Incident date cannot be in the future.');
        return;
      }
      if (incDate < minAllowed) {
        toast.error('Incidents must be reported within 14 days of occurrence.');
        return;
      }
    }
    mutate(editInc);
  };

  return (
    <Modal
      open={show}
      onClose={onClose}
      title="Edit Incident"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            disabled={isPending || !editInc.description?.trim()}
            onClick={handleSave}
            className="btn-primary disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      <div className="space-y-4 pt-1">
        <Alert type="info" message="You can edit this incident only while it hasn't been reviewed by your HOD yet." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label field-required">Incident Date</label>
            <input
              type="date"
              value={editInc.incidentDate || ''}
              min={(() => {
                const d = new Date();
                d.setDate(d.getDate() - 14);
                return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
              })()}
              max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]}
              onChange={e => setEditInc(p => ({ ...p, incidentDate: e.target.value }))}
              className="input"
            />
            <p className="text-xs text-slate-500 mt-1">Must be within the past 14 days.</p>
          </div>
          <div>
            <label className="field-label field-required">Incident Time</label>
            <input
              type="time"
              value={editInc.incidentTime || ''}
              onChange={e => setEditInc(p => ({ ...p, incidentTime: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="field-label field-required">Occurred To</label>
            <select
              value={editInc.occurredTo || ''}
              onChange={e => setEditInc(p => ({ ...p, occurredTo: e.target.value }))}
              className="select"
            >
              <option value="">Select…</option>
              {OCCURRED_TO_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label field-required">Severity</label>
            <select
              value={editInc.severity || ''}
              onChange={e => setEditInc(p => ({ ...p, severity: e.target.value }))}
              className="select"
            >
              <option value="">Select…</option>
              {SEVERITY_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="field-label field-required">
            Description
            <span className="text-slate-400 font-normal ml-1">({(editInc.description || '').length}/2000)</span>
          </label>
          <textarea
            rows={5}
            value={editInc.description || ''}
            onChange={e => setEditInc(p => ({ ...p, description: e.target.value }))}
            maxLength={2000}
            className="textarea"
            placeholder="Update the incident description…"
          />
        </div>
      </div>
    </Modal>
  );
}

export function FilePreviewModal({ previewFile, onClose }) {
  const [fileUrl, setFileUrl] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (!previewFile) {
      setFileUrl(null);
      setLoading(false);
      setError(false);
      return;
    }

    if (previewFile instanceof File || previewFile instanceof Blob) {
      const objUrl = URL.createObjectURL(previewFile);
      setFileUrl(objUrl);
      return () => URL.revokeObjectURL(objUrl);
    }

    if (previewFile.url) {
      setFileUrl(previewFile.url);
      return;
    }

    if (previewFile.id) {
      setLoading(true);
      setError(false);
      attachmentsApi.getPreviewUrl(previewFile.id)
        .then(res => {
          if (res.data?.url) {
            setFileUrl(res.data.url);
          } else {
            setFileUrl(`${API_BASE_URL}/attachments/${previewFile.id}/view`);
          }
        })
        .catch(() => {
          setFileUrl(`${API_BASE_URL}/attachments/${previewFile.id}/view`);
        })
        .finally(() => setLoading(false));
    } else if (previewFile.stored_filename) {
      setFileUrl(`${UPLOADS_URL}/${previewFile.stored_filename?.split('/').map(encodeURIComponent).join('/')}`);
    }
  }, [previewFile]);

  const filename = previewFile?.original_filename || previewFile?.name || 'File Preview';
  const isImage = previewFile?.mime_type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)($|\?)/i.test(filename) || /\.(jpe?g|png|gif|webp|bmp|svg)($|\?)/i.test(fileUrl || '');
  const isPdf = previewFile?.mime_type === 'application/pdf' || /\.pdf($|\?)/i.test(filename) || /\.pdf($|\?)/i.test(fileUrl || '');

  const handleDownload = async () => {
    if (!previewFile) return;
    if (previewFile instanceof File || previewFile instanceof Blob) {
      const url = URL.createObjectURL(previewFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    if (previewFile.id) {
      try {
        const res = await attachmentsApi.getDownloadUrl(previewFile.id);
        if (res.data?.url) {
          window.open(res.data.url, '_blank');
          return;
        }
      } catch (_) {}
    }
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };

  return (
    <Modal
      open={!!previewFile}
      onClose={onClose}
      title={filename}
      size="full"
      footer={
        <div className="flex justify-between w-full">
          {previewFile ? (
            <button
              onClick={handleDownload}
              className="btn-primary flex items-center gap-2"
            >
              <Download size={16} /> Download
            </button>
          ) : <div />}
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      }
    >
      {previewFile && (
        <div className="flex items-center justify-center bg-slate-900 rounded-xl overflow-hidden min-h-[50vh] max-h-[80vh] p-2 relative">
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-slate-300">
              <Spinner size={32} />
              <p className="text-sm">Loading attachment preview...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center bg-white rounded-xl w-full flex flex-col items-center justify-center">
              <FileText size={48} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-700 font-medium mb-1">Failed to load preview</p>
              <p className="text-xs text-slate-500 mb-4">You can download the file directly to view it.</p>
              <button onClick={handleDownload} className="btn-primary">Download File</button>
            </div>
          ) : isImage && fileUrl ? (
            <img
              src={fileUrl}
              alt="Preview"
              onError={() => setError(true)}
              className="max-w-full max-h-[78vh] object-contain rounded-lg shadow-sm"
            />
          ) : isPdf && fileUrl ? (
            <iframe src={fileUrl} className="w-full h-[78vh] rounded-lg" title="PDF Preview" />
          ) : (
            <div className="p-8 text-center bg-white rounded-xl w-full flex flex-col items-center justify-center">
              <FileText size={48} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium mb-2">Preview not available for this file format</p>
              <button onClick={handleDownload} className="btn-primary inline-flex mt-2">
                Download File
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function InvolveDepartmentModal({ show, onClose, currentDepartments = [], departmentsList = [], mutate, isPending }) {
  const [selectedDeptIds, setSelectedDeptIds] = React.useState([]);

  React.useEffect(() => {
    if (!show) setSelectedDeptIds([]);
  }, [show]);

  const currentNames = currentDepartments.map(d => (typeof d === 'string' ? d : d.name).toLowerCase());
  const availableDepts = departmentsList.filter(d => !currentNames.includes((d.name || '').toLowerCase()));

  const toggleDept = (id) => {
    setSelectedDeptIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <Modal open={show} onClose={onClose} title="Involve Additional Department(s)" size="md"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={() => mutate(selectedDeptIds)}
          disabled={selectedDeptIds.length === 0 || isPending}
          className="btn-primary"
        >
          {isPending && <Spinner size={15} className="text-white" />} Involve Selected ({selectedDeptIds.length})
        </button>
      </>}
    >
      <div className="space-y-4">
        <Alert type="info" message="Select one or more departments whose feedback is also required for this incident. Their HODs will be notified immediately." />

        <div className="text-xs text-slate-500 font-medium">
          Currently involved: <span className="text-slate-800 font-semibold">{currentDepartments.map(d => typeof d === 'string' ? d : d.name).join(', ') || 'None'}</span>
        </div>

        <div>
          <label className="field-label mb-2">Available Departments to Add</label>
          {availableDepts.length === 0 ? (
            <p className="text-sm text-slate-500 py-3">All hospital departments are already involved.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {availableDepts.map(d => (
                <label key={d.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedDeptIds.includes(d.id)}
                    onChange={() => toggleDept(d.id)}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-800">{d.name}</div>
                    {d.hod_name && <div className="text-xs text-slate-500">HOD: {d.hod_name}</div>}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

