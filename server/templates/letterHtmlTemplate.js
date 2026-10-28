const fs = require('fs');
const path = require('path');
const { getIncidentUrl } = require('../utils/qrCodeService');

// Cache base64 asset strings in memory for instant reuse
let cachedHeaderLogoBase64 = null;
let cachedWatermarkBase64 = null;
let cachedNabhBase64 = null;

function loadLetterheadAssets() {
  if (!cachedHeaderLogoBase64) {
    const headerPath = path.join(__dirname, '../assets/letterhead/jph-header-logo.png');
    const watermarkPath = path.join(__dirname, '../assets/letterhead/jph-round-watermark.png');
    const nabhPath = path.join(__dirname, '../assets/letterhead/nabh-accredited-logo.svg');

    cachedHeaderLogoBase64 = fs.existsSync(headerPath) ? fs.readFileSync(headerPath).toString('base64') : '';
    cachedWatermarkBase64 = fs.existsSync(watermarkPath) ? fs.readFileSync(watermarkPath).toString('base64') : '';
    const nabhSvg = fs.existsSync(nabhPath) ? fs.readFileSync(nabhPath, 'utf8') : '';
    cachedNabhBase64 = nabhSvg ? Buffer.from(nabhSvg).toString('base64') : '';
  }

  return {
    headerLogoBase64: cachedHeaderLogoBase64,
    watermarkBase64: cachedWatermarkBase64,
    nabhBase64: cachedNabhBase64
  };
}

// Inline Vector SVG Icons for perfect PDF rendering (zero emoji/font dependency)
const ICON_PIN = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#146537" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 2px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
const ICON_PHONE = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#146537" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 2px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
const ICON_MAIL = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#146537" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 2px;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
const ICON_GLOBE = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#146537" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 2px;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;

/**
 * Puppeteer Header Template (Rendered in top margin on EVERY page)
 */
function getHeaderTemplate() {
  const { headerLogoBase64, nabhBase64 } = loadLetterheadAssets();

  return `
  <style>
    *, *:before, *:after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .header-wrap {
      width: 100%;
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .top-bar {
      position: relative;
      width: 100%;
      height: 12px;
      background-color: #146537;
      overflow: hidden;
    }
    .top-wedge-main {
      position: absolute;
      top: 0;
      left: 0;
      width: 38px;
      height: 100%;
      background-color: #8DC63F;
      transform: skewX(-35deg);
      transform-origin: top left;
      margin-left: -10px;
    }
    .top-wedge-stripe {
      position: absolute;
      top: 0;
      left: 32px;
      width: 5px;
      height: 100%;
      background-color: #ffffff;
      transform: skewX(-35deg);
    }
    .header-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 18mm 2px 18mm;
    }
    .brand-col {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .brand-img {
      height: 38px;
      object-fit: contain;
      object-position: left center;
    }
    .doc-num {
      font-size: 7.2pt;
      font-weight: 600;
      color: #334155;
      margin-top: 3px;
      letter-spacing: 0.2px;
    }
    .right-unit {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
    }
    .div-line {
      width: 1.5px;
      height: 56px;
      background-color: #94a3b8;
    }
    .contact-col {
      display: flex;
      flex-direction: column;
      justify-content: center;
      font-size: 6.8pt;
      line-height: 1.38;
      color: #1e293b;
      white-space: nowrap;
    }
    .contact-row {
      display: flex;
      align-items: center;
      gap: 3px;
      margin-bottom: 1px;
      white-space: nowrap;
    }
    .nabh-col {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-left: 2px;
    }
    .nabh-img {
      height: 58px;
      width: auto;
    }
  </style>
  <div class="header-wrap">
    <div class="top-bar">
      <div class="top-wedge-main"></div>
      <div class="top-wedge-stripe"></div>
    </div>
    <div class="header-content">
      <div class="brand-col">
        <img class="brand-img" src="data:image/png;base64,${headerLogoBase64}" alt="Jaiprakash Hospitals" />
        <div class="doc-num">Doc. No.: JPHRC/GNR/FRM/004A</div>
      </div>
      <div class="right-unit">
        <div class="div-line"></div>
        <div class="contact-col">
          <div class="contact-row">
            <span>${ICON_PIN}<strong>Main Hospital :</strong> Dayanand Nagar, Rourkela-769004, Odisha</span>
          </div>
          <div class="contact-row">
            <span>${ICON_PHONE}<strong>Helpline No. :</strong> 9779 109 109</span>
          </div>
          <div class="contact-row">
            <span>${ICON_MAIL}info@jaiprakashhospitals.com</span>
          </div>
          <div class="contact-row">
            <span>${ICON_GLOBE}www.jaiprakashhospitals.com</span>
          </div>
          <div style="font-weight: 700; margin-top: 1px; color: #0f172a;">
            CIN : U85120OR2008PTC029111
          </div>
        </div>
        <div class="nabh-col">
          <img class="nabh-img" src="data:image/svg+xml;base64,${nabhBase64}" alt="NABH Accredited" />
        </div>
      </div>
    </div>
  </div>
  `;
}

/**
 * Puppeteer Footer Template (Rendered in bottom margin on EVERY page)
 */
function getFooterTemplate(referenceNumber) {
  return `
  <style>
    *, *:before, *:after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .footer-wrap {
      width: 100%;
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .footer-body {
      padding: 0 18mm 4px 18mm;
      font-size: 6.8pt;
      line-height: 1.35;
      color: #334155;
    }
    .branch-line {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 2px;
      white-space: nowrap;
    }
    .f-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.2pt;
      font-weight: 600;
      color: #64748b;
      padding-top: 2px;
      margin-top: 2px;
      border-top: 1px dotted #cbd5e1;
    }
    .bottom-bar {
      position: relative;
      width: 100%;
      height: 11px;
      background-color: #146537;
      overflow: hidden;
    }
    .bottom-wedge-main {
      position: absolute;
      top: 0;
      left: 0;
      width: 34px;
      height: 100%;
      background-color: #8DC63F;
      transform: skewX(-35deg);
      transform-origin: top left;
      margin-left: -10px;
    }
  </style>
  <div class="footer-wrap">
    <div class="footer-body">
      <div class="branch-line">
        <span>${ICON_PIN}<strong>City Centre,</strong> Ambedkar Chowk, Uditnagar, Rourkela-769012</span>
        <span>${ICON_PHONE}: 7606000999 / 7682860043</span>
        <span>${ICON_MAIL}: citycentre@jaiprakashhospitals.com</span>
      </div>
      <div class="branch-line">
        <span>${ICON_PIN}<strong>City Centre,</strong> Main Road, Rajgangpur-770017</span>
        <span>${ICON_PHONE}: 9078884831 / 9078884832</span>
        <span>${ICON_MAIL}: citycentre.rgp@jaiprakashhospitals.com</span>
      </div>
      <div class="f-meta">
        <span>Ref: ${referenceNumber || 'JPHRC/IMS'}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    </div>
    <div class="bottom-bar">
      <div class="bottom-wedge-main"></div>
    </div>
  </div>
  `;
}

/**
 * Format date in DD-MM-YYYY
 */
function formatDate(d) {
  const date = d ? new Date(d) : new Date();
  if (isNaN(date.getTime())) return String(d || '');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Build Letter Document HTML (Rendered inside the A4 page body)
 */
function buildLetterHtml({ letter, incident = {}, approvers = {}, qrCodeDataUrl = null, isDraft = false, incidentUrl = null }) {
  const { watermarkBase64 } = loadLetterheadAssets();

  const refNumber = letter.reference_number || letter.ref_number || 'JPHRC/IMS/DRAFT';
  const letterDate = formatDate(letter.letter_date || letter.created_at || new Date());
  const recipientName = letter.recipient_name || letter.employee_name || 'Staff Member';

  const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
  let recipientEmpNo = letter.recipient_emp_no || letter.employee_code || '';
  if (isUuid(recipientEmpNo)) {
    recipientEmpNo = (letter.employee_code && !isUuid(letter.employee_code))
      ? letter.employee_code
      : (letter.user_employee_id || letter.emp_id || '');
  }

  const incId = letter.incident_id || incident.id;
  const finalIncidentUrl = incidentUrl || (incId ? getIncidentUrl(incId) : '');
  const recipientDept = letter.recipient_department || letter.employee_department || 'Hospital Personnel';
  const recipientDesig = letter.recipient_designation || letter.employee_designation || '';
  const subject = letter.subject || 'Official Hospital Directive';
  let salutation = letter.salutation || 'Dear Staff,';
  // Ensure single comma at end of salutation
  salutation = salutation.replace(/,+$/, '') + ',';

  // Format body text with paragraphs
  const rawBody = letter.body_text || letter.body_content || '';
  const paragraphs = rawBody
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  // Normalize CC recipients list
  let ccList = [];
  if (Array.isArray(letter.cc_recipients)) {
    ccList = letter.cc_recipients;
  } else if (Array.isArray(letter.cc_list)) {
    ccList = letter.cc_list;
  } else if (typeof letter.cc_recipients === 'string') {
    try { ccList = JSON.parse(letter.cc_recipients); } catch (_) { ccList = []; }
  }

  const drafterName = approvers.draftedByName || letter.drafted_by_name || 'Incident Management Committee Lead';
  const approverName = approvers.approvedByName || letter.approved_by_name || 'Executive Management Authority';
  const approvedAtStr = letter.approved_at ? formatDate(letter.approved_at) : letterDate;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Official Letter - ${refNumber}</title>
  <style>
    @page {
      size: A4 portrait;
      margin-top: 32mm;
      margin-bottom: 24mm;
      margin-left: 18mm;
      margin-right: 18mm;
    }

    *, *:before, *:after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.6;
      color: #1e293b;
      background: #ffffff;
    }

    /* Fixed Central Watermark (Repeats on every page, 60% page width, 7% opacity) */
    .watermark-fixed {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 125mm;
      height: 125mm;
      opacity: 0.07;
      z-index: 0;
      pointer-events: none;
    }

    .watermark-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    /* Faint DRAFT watermark overlay for unapproved letters */
    .draft-watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 50pt;
      font-weight: 900;
      color: rgba(225, 29, 72, 0.08);
      text-transform: uppercase;
      letter-spacing: 8px;
      z-index: 1;
      pointer-events: none;
      white-space: nowrap;
    }

    /* Main Letter Content Flow */
    .letter-body {
      position: relative;
      z-index: 10;
    }

    .ref-date-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
      font-size: 10pt;
      font-weight: 600;
      color: #0f172a;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 5px;
    }

    .recipient-box {
      margin-bottom: 10px;
      background: #f8fafc;
      border-left: 3.5px solid #146537;
      padding: 7px 12px;
      border-radius: 4px;
      font-size: 9.5pt;
      line-height: 1.45;
    }

    .recipient-to {
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 1px;
    }

    .recipient-name {
      font-weight: 700;
      color: #146537;
      font-size: 10.2pt;
    }

    .subject-line {
      font-size: 10.2pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 8px;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .salutation {
      font-weight: 600;
      margin-bottom: 8px;
      color: #1e293b;
    }

    .content-paragraphs {
      font-size: 10pt;
      line-height: 1.55;
      text-align: justify;
      color: #1e293b;
    }

    .content-paragraphs p {
      margin-top: 0;
      margin-bottom: 8px;
    }

    /* Monetary Penalty Highlight Box (if penalty letter) */
    .penalty-box {
      margin: 12px 0;
      background: #fff1f2;
      border: 1.5px solid #fecdd3;
      border-left: 4px solid #e11d48;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 9.5pt;
      color: #9f1239;
    }

    /* Wrap sign-off and CC to keep them together where possible */
    .signoff-and-cc-block {
      page-break-inside: avoid;
      margin-top: 14px;
    }

    /* Sign-off & Closing Section */
    .closing-section {
      padding-top: 8px;
      border-top: 1px solid #cbd5e1;
    }

    .sign-off-order {
      font-size: 9.5pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 3px;
    }

    .sign-off-authority {
      font-size: 9pt;
      font-weight: 600;
      color: #334155;
    }

    .sign-off-names {
      font-size: 8pt;
      color: #475569;
      margin-top: 3px;
      line-height: 1.35;
    }

    .digital-approval-badge {
      display: inline-block;
      margin-top: 6px;
      background: #f0fdf4;
      border: 1px solid #86efac;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 7.5pt;
      color: #166534;
      font-weight: 600;
    }

    /* Carbon Copy & Verification QR Code */
    .footer-cc-qr-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px dashed #cbd5e1;
    }

    .cc-container {
      flex: 1;
      padding-right: 20px;
    }

    .cc-title {
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 4px;
    }

    .cc-list {
      margin: 0;
      padding-left: 0;
      list-style: none;
      font-size: 8pt;
      color: #475569;
      line-height: 1.45;
    }

    .qr-container {
      width: 115px;
      text-align: center;
      flex-shrink: 0;
    }

    .qr-img {
      width: 95px;
      height: 95px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 2px;
      background: #ffffff;
      cursor: pointer;
    }

    .qr-caption {
      font-size: 7pt;
      color: #64748b;
      margin-top: 4px;
      line-height: 1.25;
    }
  </style>
</head>
<body>

  <!-- FIXED CENTRAL WATERMARK (Repeats on every page) -->
  <div class="watermark-fixed">
    <img class="watermark-img" src="data:image/png;base64,${watermarkBase64}" alt="JPH Watermark" />
  </div>

  ${isDraft ? '<div class="draft-watermark">DRAFT — FOR REVIEW</div>' : ''}

  <!-- LETTER BODY -->
  <div class="letter-body">
    <div class="ref-date-row">
      <div><strong>Ref No:</strong> ${refNumber}</div>
      <div><strong>Date:</strong> ${letterDate}</div>
    </div>

    <div class="recipient-box">
      <div class="recipient-to">To,</div>
      <div class="recipient-name">${recipientName}</div>
      ${recipientEmpNo ? `<div><strong>Emp. ID:</strong> ${recipientEmpNo}</div>` : ''}
      <div><strong>Department:</strong> ${recipientDept}${recipientDesig ? ` • <strong>Designation:</strong> ${recipientDesig}` : ''}</div>
    </div>

    <div class="subject-line">Subject: ${subject}</div>

    <div class="salutation">${salutation}</div>

    <div class="content-paragraphs">
      ${paragraphs}
    </div>

    ${letter.penalty_amount ? `
      <div class="penalty-box">
        <strong>Monetary Penalty Ordered:</strong> ₹${Number(letter.penalty_amount).toLocaleString('en-IN')} 
        ${letter.penalty_amount_words ? `(${letter.penalty_amount_words})` : ''}
        <div style="font-size: 8pt; margin-top: 2px; color: #4c0519;">
          Recovery shall be processed through Accounts / Payroll as per hospital disciplinary regulations.
        </div>
      </div>
    ` : ''}

    <!-- Closing Signature Block & CC Block (Kept together) -->
    <div class="signoff-and-cc-block">
      <div class="closing-section">
        <div class="sign-off-order">By Order of,</div>
        <div class="sign-off-authority">Incident Management Committee & Executive Management</div>
        <div style="font-size: 8.5pt; color: #475569; margin-top: 2px;">Jaiprakash Hospital and Research Centre Pvt. Ltd.</div>

        <div class="sign-off-names">
          Drafted by: <strong>${drafterName}</strong><br/>
          Approved by: <strong>${approverName}</strong>
        </div>

        <div class="digital-approval-badge">
          ✓ Digitally verified and approved via IMS on ${approvedAtStr} • Ref: ${refNumber}
        </div>
      </div>

      <!-- Carbon Copy & QR Code -->
      <div class="footer-cc-qr-row">
        <div class="cc-container">
          <div class="cc-title">Copy Communicated for Information & Record To:</div>
          <ul class="cc-list">
            ${ccList.map((cc, i) => `<li>${i + 1}. ${cc.label || cc.name || ''} (${cc.role || 'Member'})</li>`).join('')}
          </ul>
        </div>

        ${qrCodeDataUrl ? `
          <div class="qr-container">
            <a href="${finalIncidentUrl || '#'}" target="_blank" rel="noopener noreferrer" class="qr-link" style="text-decoration: none; cursor: pointer; display: inline-block;">
              <img class="qr-img" src="${qrCodeDataUrl}" alt="IMS Dossier QR" />
              <div class="qr-caption">Scan or click to verify authentic incident dossier</div>
            </a>
          </div>
        ` : ''}
      </div>
    </div>
  </div>

</body>
</html>`;
}

/**
 * Concise Email Dispatch Notification Body
 * The official letterhead is attached as a signed A4 PDF
 */
function buildEmailDispatchNoticeHtml({ letter, incident, portalUrl }) {
  const refNumber = letter.reference_number || letter.ref_number || '';
  const recipientName = letter.recipient_name || letter.employee_name || 'Staff Member';
  const subject = letter.subject || 'Incident Management Notice';
  const incRef = incident.reference_id || 'Incident';

  return `
    <div style="max-width: 620px; margin: 0 auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; color: #1e293b; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <!-- Clean Hospital Banner -->
      <div style="background: linear-gradient(135deg, #146537 0%, #0d4625 100%); color: #ffffff; padding: 22px 24px; text-align: left;">
        <div style="font-size: 16px; font-weight: 700; letter-spacing: 0.5px;">JAIPRAKASH HOSPITAL & RESEARCH CENTRE</div>
        <div style="font-size: 11px; color: #86efac; text-transform: uppercase; letter-spacing: 1px; margin-top: 3px;">Incident Management Committee • Quality & Patient Safety</div>
      </div>

      <!-- Notification Body -->
      <div style="padding: 28px 24px; line-height: 1.6;">
        <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">
          Formal Communication Regarding Incident Ref: ${incRef}
        </div>

        <p style="font-size: 13.5px; color: #334155; margin-top: 0;">
          Dear <strong>${recipientName}</strong>,
        </p>

        <p style="font-size: 13.5px; color: #334155;">
          Please be informed that Executive Management and the Incident Management Committee have concluded the review for incident <strong>${incRef}</strong> and formally issued the following directive:
        </p>

        <div style="background: #f8fafc; border-left: 4px solid #146537; padding: 12px 16px; border-radius: 6px; margin: 16px 0;">
          <div style="font-size: 12px; color: #64748b; font-weight: 600;">Subject:</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${subject}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Ref. Number: <strong>${refNumber}</strong></div>
        </div>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px 16px; margin: 18px 0; font-size: 13px; color: #166534;">
          📎 <strong>Official Signed Letter Attached:</strong> The complete directive on authentic hospital letterhead has been generated, digitally verified, and attached to this email as a PDF document (<code>${refNumber}.pdf</code>).
        </div>

        <p style="font-size: 12.5px; color: #64748b;">
          You can also access the full incident timeline and institutional records directly on the hospital intranet:
        </p>

        <div style="text-align: center; margin: 24px 0 16px 0;">
          <a href="${portalUrl}" target="_blank" style="display: inline-block; background: #146537; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 6px; font-size: 13px; font-weight: 600;">
            View Incident Record in IMS
          </a>
        </div>

        <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center;">
          This is an official communication from Jaiprakash Hospital and Research Centre Pvt. Ltd., Rourkela.<br/>
          CIN: U85120OR2008PTC029111 • NABH Accredited
        </div>
      </div>
    </div>
  `;
}

module.exports = {
  loadLetterheadAssets,
  getHeaderTemplate,
  getFooterTemplate,
  buildLetterHtml,
  buildEmailDispatchNoticeHtml,
  formatDate
};
