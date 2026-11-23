import { Modal } from './Modal';
import { Download, FileText } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

export function AttachmentViewerModal({ open, onClose, fileUrl, fileName }) {
  const imageRegex = /\.(jpe?g|png|gif|webp|bmp|svg)($|\?)/i;
  const isImage = (fileUrl && imageRegex.test(fileUrl)) || (fileName && imageRegex.test(fileName));
  const isPdf = (fileUrl && /\.pdf($|\?)/i.test(fileUrl)) || (fileName && /\.pdf$/i.test(fileName));

  const [failedUrl, setFailedUrl] = useState(null);
  const imgError = failedUrl === fileUrl;

  const handleDownload = async () => {
    if (!fileUrl) return;
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'attachment';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
      toast('Opened file in a new tab.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={fileName || 'Attachment Preview'}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
          {fileUrl && (
            <button
              type="button"
              onClick={handleDownload}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-colors flex items-center gap-2"
            >
              <Download size={14} /> Download File
            </button>
          )}
        </>
      }
    >
      <div className="p-4 flex flex-col items-center justify-center min-h-[300px] bg-slate-50/50 rounded-xl border border-slate-100">
        {!fileUrl ? (
          <div className="text-slate-400">Loading attachment...</div>
        ) : isImage && !imgError ? (
          <img
            src={fileUrl}
            alt={fileName || 'Attachment'}
            onError={() => setFailedUrl(fileUrl)}
            className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
          />
        ) : isPdf ? (
          <iframe
            src={fileUrl}
            className="w-full h-[70vh] rounded-lg border border-slate-200"
            title={fileName || 'PDF Preview'}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <FileText size={56} className="text-slate-300" />
            <p className="text-sm font-medium">This file type cannot be previewed directly.</p>
            <p className="text-xs text-slate-400">Use Download File below to view it on your device.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
