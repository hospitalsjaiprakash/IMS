import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, attachmentsApi } from '../../api';
import { Spinner, Pagination, Modal, Alert, EmptyState } from '../../components/ui';
import { Paperclip, Download, Eye, HardDrive, FileArchive, Search, X, ChevronDown, ChevronRight, File, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function AdminAttachmentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [zippingRefId, setZippingRefId] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const itemsPerPage = 15;

  const toggleRow = (refId) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(refId)) next.delete(refId);
      else next.add(refId);
      return next;
    });
  };

  const {
    data: attachments = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['admin-attachments'],
    queryFn: () => adminApi.getAllAttachments().then((r) => r.data || []),
  });

  const groupedData = useMemo(() => {
    const groups = {};
    let totalBytes = 0;
    const totalFiles = attachments.length;

    attachments.forEach((att) => {
      const fileSize = parseInt(att.file_size, 10) || 0;
      totalBytes += fileSize;
      if (!groups[att.reference_id]) {
        groups[att.reference_id] = {
          incidentId: att.incident_id,
          referenceId: att.reference_id,
          files: [],
          totalSize: 0,
        };
      }
      groups[att.reference_id].files.push(att);
      groups[att.reference_id].totalSize += fileSize;
    });

    const list = Object.values(groups);
    const term = search.trim().toLowerCase();
    const filtered = term
      ? list.filter(
          (g) =>
            g.referenceId?.toLowerCase().includes(term) ||
            g.files.some((f) => f.original_filename?.toLowerCase().includes(term))
        )
      : list;

    return {
      totalBytes,
      totalFiles,
      list: filtered,
    };
  }, [attachments, search]);

  const totalPages = Math.ceil(groupedData.list.length / itemsPerPage) || 1;
  const paginatedData = groupedData.list.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const getPresignedUrl = async (file) => {
    const res = await attachmentsApi.getDownloadUrl(file.id);
    if (!res.data?.url) throw new Error('Presigned URL unavailable');
    return res.data.url;
  };

  const getPresignedPreviewUrl = async (file) => {
    const res = await attachmentsApi.getPreviewUrl(file.id);
    if (!res.data?.url) throw new Error('Preview URL unavailable');
    return res.data.url;
  };

  const handleBulkDownload = async (group) => {
    try {
      setZippingRefId(group.referenceId);
      toast.loading(`Zipping ${group.files.length} files...`, { id: 'zip-toast' });

      const zip = new JSZip();
      await Promise.all(
        group.files.map(async (file) => {
          const fetchUrl = await getPresignedUrl(file);
          const response = await fetch(fetchUrl);
          if (!response.ok) throw new Error(`Failed to fetch ${file.original_filename}`);
          const blob = await response.blob();
          zip.file(file.original_filename, blob);
        })
      );

      const zipContent = await zip.generateAsync({ type: 'blob' });
      saveAs(zipContent, `${group.referenceId}_attachments.zip`);
      toast.success('Archive downloaded successfully.', { id: 'zip-toast' });
    } catch {
      toast.error('Failed to bundle attachments into zip archive.', { id: 'zip-toast' });
    } finally {
      setZippingRefId(null);
    }
  };

  const handleFilePreview = async (file) => {
    toast.loading('Preparing preview...', { id: 'file-load' });
    try {
      const fetchUrl = await getPresignedPreviewUrl(file);
      toast.dismiss('file-load');
      setPreviewFile({ ...file, fetchUrl });
    } catch {
      toast.error('Could not load file preview.', { id: 'file-load' });
    }
  };

  const handleDownloadDirect = async (file) => {
    toast.loading('Preparing download...', { id: 'dl-load' });
    try {
      const fetchUrl = await getPresignedUrl(file);
      toast.dismiss('dl-load');
      const a = document.createElement('a');
      a.href = fetchUrl;
      a.download = file.original_filename;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error('Download failed.', { id: 'dl-load' });
    }
  };

  return (
    <div className="space-y-6 w-full pb-14">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 font-display">System Attachments</h1>
        <p className="text-sm text-slate-500 mt-1">Audit and download uploaded incident evidence across the platform</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-blue-600 flex items-center justify-center">
            <Paperclip size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-blue-800/70 uppercase tracking-wide">Total Files</p>
            <p className="text-3xl font-extrabold text-blue-900 mt-1">{groupedData.totalFiles}</p>
          </div>
        </div>
        <div className="card p-5 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm text-purple-600 flex items-center justify-center">
            <HardDrive size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-purple-800/70 uppercase tracking-wide">Total Storage</p>
            <p className="text-3xl font-extrabold text-purple-900 mt-1">{formatBytes(groupedData.totalBytes)}</p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Reference ID or file name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="input pl-9 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Spinner />
          </div>
        ) : isError ? (
          <div className="space-y-3 py-6">
            <Alert type="error" title="Error" message="Failed to load attachment registry." />
            <button type="button" onClick={() => refetch()} className="btn-secondary inline-flex items-center gap-2">
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : groupedData.list.length === 0 ? (
          <EmptyState
            icon={Paperclip}
            title="No attachments found"
            message={search ? 'No incident attachments match your search filter.' : 'No files have been uploaded yet.'}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Reference ID</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Files Count</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Total Size</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedData.map((group) => {
                  const isExpanded = expandedRows.has(group.referenceId);
                  const isZippingThis = zippingRefId === group.referenceId;
                  return (
                    <React.Fragment key={group.referenceId}>
                      <tr
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => toggleRow(group.referenceId)}
                      >
                        <td className="px-4 py-3 font-mono font-bold text-slate-800 flex items-center gap-2">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-label={`Toggle files for ${group.referenceId}`}
                            className="p-1 rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                          {group.referenceId}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium text-xs">
                            <Paperclip size={12} /> {group.files.length}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-600">{formatBytes(group.totalSize)}</td>
                        <td className="px-4 py-3 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                          <Link
                            to={`/incidents/${encodeURIComponent(group.incidentId)}`}
                            className="btn-secondary py-1.5 px-3 text-xs inline-flex items-center gap-1"
                          >
                            <Eye size={14} /> View
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleBulkDownload(group)}
                            disabled={Boolean(zippingRefId)}
                            className="btn-primary py-1.5 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 inline-flex items-center gap-1"
                          >
                            <FileArchive size={14} />
                            {isZippingThis ? 'Zipping...' : 'Bulk Zip'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={4} className="px-4 py-4 border-b border-slate-100">
                            <div className="pl-8">
                              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                                Attached Documents
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {group.files.map((file) => {
                                  const fileExt = (file.original_filename || '').split('.').pop()?.toUpperCase();
                                  return (
                                    <div
                                      key={file.id}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => handleFilePreview(file)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          handleFilePreview(file);
                                        }
                                      }}
                                      className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group/file text-left w-full"
                                    >
                                      <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 group-hover/file:bg-indigo-600 group-hover/file:text-white transition-colors">
                                        <File size={20} />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p
                                          className="text-sm font-medium text-slate-800 truncate group-hover/file:text-indigo-700 transition-colors"
                                          title={file.original_filename}
                                        >
                                          {file.original_filename}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                            {fileExt || 'FILE'}
                                          </span>
                                          <span className="text-xs text-slate-500">{formatBytes(file.file_size)}</span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDownloadDirect(file);
                                            }}
                                            className="ml-auto p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                            title="Download file"
                                            aria-label={`Download ${file.original_filename}`}
                                          >
                                            <Download size={14} />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      <Modal
        open={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.original_filename || 'File Preview'}
        size="full"
        footer={
          <div className="flex justify-between w-full">
            {previewFile ? (
              <button
                type="button"
                onClick={() => handleDownloadDirect(previewFile)}
                className="btn-primary flex items-center gap-2"
              >
                <Download size={16} />
                Download
              </button>
            ) : (
              <div />
            )}
            <button type="button" onClick={() => setPreviewFile(null)} className="btn-secondary">
              Close
            </button>
          </div>
        }
      >
        {previewFile && (
          <div
            className="flex justify-center bg-slate-900 rounded-xl overflow-hidden"
            style={{ minHeight: '50vh', maxHeight: '80vh' }}
          >
            {previewFile.mime_type?.startsWith('image/') ||
            previewFile.original_filename?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
              <img src={previewFile.fetchUrl} alt={previewFile.original_filename} className="w-full h-full object-contain" />
            ) : previewFile.mime_type === 'application/pdf' ||
              previewFile.original_filename?.match(/\.pdf$/i) ? (
              <iframe src={previewFile.fetchUrl} className="w-full h-[80vh]" title="PDF Preview" />
            ) : (
              <div className="p-8 text-center bg-white w-full flex flex-col items-center justify-center">
                <File size={48} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-600 font-medium mb-2">Preview not available for this file type</p>
                <button
                  type="button"
                  onClick={() => handleDownloadDirect(previewFile)}
                  className="btn-primary inline-flex items-center gap-2 mt-2"
                >
                  <Download size={15} /> Download File
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
