import React from 'react';
import { Paperclip, X, Upload } from 'lucide-react';

export default function FileUploadArea({ files, setFiles }) {
  return (
    <div className="mt-4">
      <label className="field-label">Attachments (Optional)</label>
      {files.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Paperclip size={14} className="text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, i) => i !== idx))}
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
              setFiles([...files, ...Array.from(e.target.files)]);
            }
            e.target.value = null;
          }}
        />
        <div className="flex flex-col items-center justify-center py-4 px-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 transition-colors">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mb-1">
            <Upload size={14} className="text-blue-600" />
          </div>
          <p className="text-sm font-medium text-slate-700">Click or drag files here</p>
        </div>
      </div>
    </div>
  );
}
