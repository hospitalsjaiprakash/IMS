import { formatDate } from '../../utils/helpers';

/**
 * Authentic JPHRC Official A4 Hospital Letterhead canvas shared by
 * LetterDraftingModal (live preview) and LettersCard (dossier viewer).
 */
export default function HospitalLetterhead({
  refNumber,
  letterDate,
  recipientName,
  recipientEmpNo,
  recipientDepartment,
  recipientDesignation,
  subject,
  salutation = 'Dear Staff,',
  bodyContent,
  contextBanner,
  penaltyAmount,
  penaltyAmountWords,
  status = 'draft',
  draftedByName,
  approvedByName,
  approvedAt,
  ccList = [],
  qrCodeUrl,
  verifyUrl,
  maxDeskHeightClass = 'max-h-[78vh]',
}) {
  const isApproved = ['approved', 'dispatched'].includes(status);
  const formattedSalutation = salutation ? `${salutation.replace(/,+$/, '')},` : 'Dear Staff,';
  const paragraphs = (bodyContent || 'No letter content written yet.').split(/\n\s*\n/);

  return (
    <div className={`bg-slate-300/80 -m-5 p-4 sm:p-8 flex justify-center overflow-y-auto ${maxDeskHeightClass}`}>
      <div className="w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-800 shadow-[0_8px_30px_rgba(0,0,0,0.18),0_1px_4px_rgba(0,0,0,0.08)] border border-slate-300 relative flex flex-col justify-between select-text my-auto font-sans">
        {/* Central Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <img
            src="/letterhead/jph-round-watermark.png"
            alt="JPH Watermark"
            className="w-[125mm] max-w-[58%] opacity-[0.07] object-contain select-none"
          />
        </div>

        {/* DRAFT Watermark Overlay */}
        {!isApproved && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
            <span className="text-5xl font-black text-rose-500/[0.08] uppercase tracking-[0.35em] -rotate-45 select-none whitespace-nowrap">
              DRAFT — FOR REVIEW
            </span>
          </div>
        )}

        {/* Top Official Letterhead Header */}
        <div className="relative z-10 bg-white">
          <div className="relative w-full h-3 bg-[#146537] overflow-hidden">
            <div className="absolute top-0 left-0 w-9 h-full bg-[#8DC63F] -skew-x-[35deg] -ml-2" />
            <div className="absolute top-0 left-8 w-1.5 h-full bg-white -skew-x-[35deg]" />
          </div>

          <div className="px-6 sm:px-[18mm] py-2.5 flex items-center justify-between border-b border-slate-200 bg-white">
            <div className="flex flex-col justify-center">
              <img
                src="/letterhead/jph-header-logo.png"
                alt="Jaiprakash Hospital"
                className="h-10 object-contain object-left"
              />
              <div className="text-[9px] font-semibold text-slate-600 mt-1 tracking-tight">
                Doc. No.: JPHRC/GNR/FRM/004A
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-[1.5px] h-14 bg-slate-300 shrink-0" />
              <div className="text-[8.5px] leading-[1.38] text-slate-700 whitespace-nowrap">
                <div>
                  <span className="text-[#146537] font-bold">📍 Main Hospital :</span> Dayanand Nagar, Rourkela-769004, Odisha
                </div>
                <div>
                  <span className="text-[#146537] font-bold">📞 Helpline No. :</span> 9779 109 109
                </div>
                <div>✉️ info@jaiprakashhospitals.com</div>
                <div>🌐 www.jaiprakashhospitals.com</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  CIN : U85120OR2008PTC029111
                </div>
              </div>
              <div className="shrink-0 pl-1">
                <img
                  src="/letterhead/nabh-accredited-logo.svg"
                  alt="NABH Accredited"
                  className="h-14 w-auto object-contain"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Printable Letter Body */}
        <div className="relative z-10 px-6 sm:px-[18mm] pt-4 pb-6 flex-1 flex flex-col justify-between text-[10pt] text-slate-800 leading-relaxed">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 text-[10pt] font-semibold text-slate-900">
              <div>
                Ref No: <span className="font-mono text-slate-900 font-bold">{refNumber || 'JPHRC/IMC/PENDING'}</span>
              </div>
              <div>
                Date: <span className="text-slate-900">{formatDate(letterDate)}</span>
              </div>
            </div>

            <div className="bg-[#f8fafc] border-l-[3.5px] border-[#146537] px-3.5 py-2 rounded text-[9.5pt] leading-[1.45] text-slate-800 space-y-0.5">
              <p className="font-bold text-slate-900 text-[10pt]">To,</p>
              <p className="font-bold text-[10.5pt] text-[#146537]">
                {recipientName || '[Employee Name]'}
              </p>
              {recipientEmpNo && (
                <p className="text-slate-600 font-medium text-[9pt]">
                  Emp. ID: <span className="font-mono text-slate-800">{recipientEmpNo}</span>
                </p>
              )}
              <p className="text-slate-600 text-[9pt]">
                Department: <span className="font-semibold text-slate-800">{recipientDepartment || '[Department]'}</span>
                {recipientDesignation && (
                  <span> • Designation: <span className="font-semibold text-slate-800">{recipientDesignation}</span></span>
                )}
              </p>
            </div>

            <div className="font-bold text-slate-900 text-[10pt]">
              Subject: <u className="underline decoration-[#146537] underline-offset-3">{subject || '[Subject line pending]'}</u>
            </div>

            {contextBanner && (
              <div className="text-[9pt] bg-amber-50 border border-amber-200 rounded p-2 text-amber-900">
                {contextBanner}
              </div>
            )}

            <div className="font-semibold text-slate-800 text-[10pt]">
              {formattedSalutation}
            </div>

            <div className="space-y-2 text-[10pt] leading-[1.6] text-justify text-slate-800">
              {paragraphs.map((p, idx) => (
                <p key={idx} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>

            {penaltyAmount && (
              <div className="my-3 bg-[#fff1f2] border border-[#fecdd3] border-l-4 border-l-[#e11d48] px-3.5 py-2.5 rounded text-[9.5pt] text-[#9f1239]">
                <div className="font-bold">
                  Monetary Penalty Ordered: ₹{Number(penaltyAmount).toLocaleString('en-IN')} {penaltyAmountWords ? `(${penaltyAmountWords})` : ''}
                </div>
                <div className="text-[8pt] text-[#4c0519] mt-0.5">
                  Recovery shall be processed through Accounts / Payroll as per hospital disciplinary regulations.
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-3 space-y-3.5">
            <div className="border-t border-slate-200 pt-2.5 space-y-0.5">
              <div className="font-bold text-slate-900 text-[9.5pt]">By Order of,</div>
              <div className="font-semibold text-slate-800 text-[9pt]">Incident Management Committee &amp; Executive Management</div>
              <div className="text-[8.5pt] text-slate-500">Jaiprakash Hospital and Research Centre Pvt. Ltd.</div>

              {draftedByName && (
                <div className="text-[8pt] text-slate-600 mt-1 leading-tight">
                  <div>Drafted by: <strong className="text-slate-800">{draftedByName}</strong></div>
                  {approvedByName && (
                    <div>Approved by: <strong className="text-slate-800">{approvedByName}</strong></div>
                  )}
                </div>
              )}

              {isApproved ? (
                <div className="inline-block mt-2 bg-[#f0fdf4] border border-[#86efac] text-[#166534] px-2.5 py-1 rounded text-[7.5pt] font-semibold">
                  ✓ Digitally verified and approved via IMS on {formatDate(approvedAt || letterDate)} • Ref: {refNumber}
                </div>
              ) : (
                <div className="inline-block mt-2 bg-amber-50 border border-amber-300 text-amber-800 px-2.5 py-1 rounded text-[7.5pt] font-semibold">
                  ⏳ Draft Directive — Pending Executive Management Approval
                </div>
              )}
            </div>

            <div className="pt-2.5 border-t border-dashed border-slate-200 flex items-end justify-between gap-4 text-[8.5pt]">
              <div className="flex-1 space-y-1 text-slate-600">
                <div className="font-bold text-slate-700 uppercase tracking-wider text-[8pt]">
                  Copy Communicated for Information &amp; Record To:
                </div>
                <ol className="list-decimal list-inside space-y-0.5 text-slate-600 text-[8pt]">
                  {ccList.map((cc, i) => (
                    <li key={i}>{typeof cc === 'object' ? (cc.label || cc.name) : cc}</li>
                  ))}
                </ol>
              </div>

              {qrCodeUrl && (
                <div className="shrink-0 text-center w-28">
                  <a
                    href={verifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block group transition-transform hover:scale-105"
                    title="Click to open Incident Dossier in IMS"
                  >
                    <img
                      src={qrCodeUrl}
                      alt="IMS QR Verification"
                      className="w-[96px] h-[96px] mx-auto border border-slate-300 rounded-md p-1 bg-white shadow-xs group-hover:border-[#146537] group-hover:shadow-md transition-all cursor-pointer"
                    />
                  </a>
                  <div className="text-[7pt] text-slate-500 mt-1 leading-tight">
                    Scan or click to verify authentic incident dossier
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Letterhead Footer */}
        <div className="relative z-10 bg-white border-t border-slate-200 mt-auto">
          <div className="px-6 sm:px-[18mm] py-2 text-[7pt] text-slate-600 space-y-0.5">
            <div className="flex items-center gap-3">
              <span>📍 <strong>City Centre,</strong> Ambedkar Chowk, Uditnagar, Rourkela-769012</span>
              <span>📞 : 7606000999 / 7682860043</span>
              <span>✉️ : citycentre@jaiprakashhospitals.com</span>
            </div>
            <div className="flex items-center gap-3">
              <span>📍 <strong>City Centre,</strong> Main Road, Rajgangpur-770017</span>
              <span>📞 : 9078884831 / 9078884832</span>
              <span>✉️ : citycentre.rgp@jaiprakashhospitals.com</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-dotted border-slate-200 text-[7pt] font-semibold text-slate-500">
              <span>Ref: {refNumber || 'JPHRC/IMC/PENDING'}</span>
              <span>Page 1 of 1 • Official Form: JPHRC/GNR/FRM/004A</span>
            </div>
          </div>

          <div className="relative w-full h-[11px] bg-[#146537] overflow-hidden">
            <div className="absolute top-0 left-0 w-8 h-full bg-[#8DC63F] -skew-x-[35deg] -ml-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
