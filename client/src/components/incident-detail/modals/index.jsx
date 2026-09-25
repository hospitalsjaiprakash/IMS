import React from 'react';
import { Download, FileText, AlertCircle } from 'lucide-react';
import { Modal, Spinner, Alert } from '../../../components/ui';
import { UPLOADS_URL } from '../../../api';
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

export function HodFeedbackModal({ show, onClose, feedbackText, setFeedbackText, hodAcknowledged, setHodAcknowledged, hodAttachments, setHodAttachments, mutate, isPending, canHodFeedback }) {
  return (
    <Modal open={show} onClose={onClose} title="Submit Feedback" size="lg"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        {canHodFeedback && (
          <button
            onClick={mutate}
            disabled={!feedbackText.trim() || !hodAcknowledged || isPending}
            className="btn-primary"
          >
            {isPending && <Spinner size={15} className="text-white" />} Submit Feedback
          </button>
        )}
      </>}
    >
      {canHodFeedback && (
        <div className="mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hodAcknowledged}
              onChange={e => setHodAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-slate-700">
              I acknowledge that I have reviewed the incident details and am providing feedback as Head of Department.
            </span>
          </label>
        </div>
      )}
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

export function ManagementDecisionModal({ show, onClose, mdFaultType, setMdFaultType, mdActions, setMdActions, mdRequireTraining, setMdRequireTraining, mdResponsibleEmployees, setMdResponsibleEmployees, mdAttachments, setMdAttachments, mdProposedOutcome, setMdProposedOutcome, incidentProposedOutcome, mutate, isPending }) {
  const [search, setSearch] = React.useState('');
  const [users, setUsers] = React.useState([]);
  const [loadingUsers, setLoadingUsers] = React.useState(false);
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

  // Quick inline search using fetch
  React.useEffect(() => {
    if (search.length > 2) {
      setLoadingUsers(true);
      const token = sessionStorage.getItem('ims_token');
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/employee/search?q=${search}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setUsers(data.employees || []);
        setLoadingUsers(false);
      })
      .catch(() => setLoadingUsers(false));
    } else {
      setUsers([]);
    }
  }, [search]);

  const addEmployee = (emp) => {
    if (!mdResponsibleEmployees.find(e => e.id === emp.id)) {
      setMdResponsibleEmployees([...mdResponsibleEmployees, { ...emp, needs_training: false }]);
    }
    setSearch('');
    setUsers([]);
  };

  const removeEmployee = (id) => {
    setMdResponsibleEmployees(mdResponsibleEmployees.filter(e => e.id !== id));
  };

  const toggleTraining = (id) => {
    setMdResponsibleEmployees(mdResponsibleEmployees.map(e => e.id === id ? { ...e, needs_training: !e.needs_training } : e));
  };

  return (
    <Modal open={show} onClose={onClose} title="Management Action" size="lg"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={() => mutate(decision)} disabled={isPending || (['DISAGREE_REINVESTIGATE', 'DISAGREE_REVISE_FEEDBACK'].includes(decision) ? !mdActions.trim() : (!mdFaultType || !mdActions.trim()))} className="btn-primary">
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
              <label className="field-label field-required">Fault Type</label>
              <input value={mdFaultType} onChange={e => setMdFaultType(e.target.value)} className="input" placeholder="e.g. System Failure, Human Error, Process Gap…" />
            </div>
            <div>
              <label className="field-label field-required">Corrective Actions / Notes</label>
              <textarea value={mdActions} onChange={e => setMdActions(e.target.value)} className="textarea" rows={5} placeholder="Describe the corrective actions taken or recommended…" />
            </div>
            
            <div className="pt-3 border-t border-slate-100">
              <label className="field-label">Responsible Employees (Optional)</label>
              <div className="relative mb-3">
                <input 
                  type="text" 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  className="input" 
                  placeholder="Search employee by name or ID to assign responsibility..."
                />
                {loadingUsers && <Spinner size={14} className="absolute right-3 top-3 text-slate-400" />}
                {users.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {users.map(u => (
                      <button
                        key={u.id}
                        onClick={() => addEmployee(u)}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-sm font-medium text-slate-800">{u.full_name}</div>
                          <div className="text-xs text-slate-500">{u.employee_id} • {u.department}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {mdResponsibleEmployees.length > 0 && (
                <div className="space-y-2 mt-2">
                  {mdResponsibleEmployees.map(emp => (
                    <div key={emp.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <div>
                        <div className="text-sm font-medium text-slate-800">{emp.full_name}</div>
                        <div className="text-xs text-slate-500">{emp.employee_id} • {emp.department}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={emp.needs_training} 
                            onChange={() => toggleTraining(emp.id)}
                            className="w-4 h-4 accent-amber-600 rounded"
                          />
                          <span className="text-sm font-semibold text-amber-700">Needs Training</span>
                        </label>
                        <button onClick={() => removeEmployee(emp.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
  return (
    <Modal
      open={!!previewFile}
      onClose={onClose}
      title={previewFile?.original_filename || 'File Preview'}
      size="full"
      footer={
        <div className="flex justify-between w-full">
          {previewFile ? (
            <a
              href={`${UPLOADS_URL}/${previewFile.stored_filename?.split('/').map(encodeURIComponent).join('/')}`}
              download={previewFile.original_filename}
              className="btn-primary flex items-center gap-2"
            >
              <Download size={16} /> Download
            </a>
          ) : <div />}
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      }
    >
      {previewFile && (
        <div className="flex justify-center bg-slate-900 rounded-xl overflow-hidden" style={{ minHeight: '50vh', maxHeight: '80vh' }}>
          {previewFile.mime_type?.startsWith('image/') || previewFile.original_filename?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
            <img src={`${UPLOADS_URL}/${previewFile.stored_filename?.split('/').map(encodeURIComponent).join('/')}`} alt="Preview" className="w-full h-full object-contain" />
          ) : previewFile.mime_type === 'application/pdf' || previewFile.original_filename?.endsWith('.pdf') ? (
            <iframe src={`${UPLOADS_URL}/${previewFile.stored_filename?.split('/').map(encodeURIComponent).join('/')}`} className="w-full h-[80vh]" title="PDF Preview" />
          ) : (
            <div className="p-8 text-center bg-white w-full flex flex-col items-center justify-center">
              <FileText size={48} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium mb-2">Preview not available</p>
              <a
                href={`${UPLOADS_URL}/${previewFile.stored_filename?.split('/').map(encodeURIComponent).join('/')}`}
                download={previewFile.original_filename}
                className="btn-primary inline-flex mt-2"
              >
                Download
              </a>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function AssignInvestigatorModal({ show, onClose, mutate, isPending }) {
  const [imcMembers, setImcMembers] = React.useState([]);
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (show) {
      setLoading(true);
      const token = sessionStorage.getItem('ims_token');
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/committee-members`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setImcMembers(data.members || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    } else {
      setSelectedIds([]);
    }
  }, [show]);

  const toggleMember = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <Modal open={show} onClose={onClose} title="Assign Investigator(s)" size="md"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={() => mutate(selectedIds)} disabled={selectedIds.length === 0 || isPending} className="btn-primary">
          {isPending && <Spinner size={15} className="text-white" />} Assign Selected
        </button>
      </>}
    >
      <div className="space-y-4">
        <Alert type="info" message="Select one or more IMC members to act as investigators for this incident. They will be notified immediately." />
        
        <div>
          <label className="field-label mb-2">IMC Members</label>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500 py-4"><Spinner size={16} /> Loading members...</div>
          ) : imcMembers.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No IMC members found.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {imcMembers.map(member => (
                <label key={member.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(member.id)}
                    onChange={() => toggleMember(member.id)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-800">{member.full_name}</div>
                    <div className="text-xs text-slate-500">{member.designation} • {member.department}</div>
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
