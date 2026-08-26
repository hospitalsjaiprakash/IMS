import { Modal } from './index';
import { Download, FileText, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';

export function AttachmentViewerModal({ open, onClose, fileUrl, fileName }) {
  const isImage = fileUrl && (
    fileUrl.toLowerCase().match(/\\.(jpeg|jpg|gif|png|webp)/i) || 
    fileUrl.includes('response-content-disposition') // S3 presigned might hide ext but usually it's passed via fileName
  );
  
  const isImageByName = fileName && fileName.toLowerCase().match(/\\.(jpeg|jpg|gif|png|webp)/i);
  
  const [imgError, setImgError] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={fileName || 'Attachment Preview'}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Close</button>
          {fileUrl && (
            <button
              onClick={async (e) => {
                e.preventDefault();
                try {
                  const response = await fetch(fileUrl);
                  if (!response.ok) throw new Error('Network response was not ok');
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = fileName || 'attachment';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  window.URL.revokeObjectURL(url);
                } catch (error) {
                  console.error('Download failed due to CORS, using fallback:', error);
                  const iframe = document.createElement('iframe');
                  iframe.style.display = 'none';
                  iframe.src = fileUrl;
                  document.body.appendChild(iframe);
                  setTimeout(() => document.body.removeChild(iframe), 10000);
                }
              }}
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
        ) : (isImage || isImageByName) && !imgError ? (
          <img
            src={fileUrl}
            alt={fileName}
            onError={() => setImgError(true)}
            className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-slate-500">
            <FileText size={64} className="text-slate-300" />
            <p className="text-sm font-medium">This file type cannot be previewed directly.</p>
            <p className="text-xs text-slate-400">Please download the file to view it.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
