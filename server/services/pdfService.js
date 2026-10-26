const puppeteer = require('puppeteer-core');
const {
  getHeaderTemplate,
  getFooterTemplate,
  buildLetterHtml
} = require('../templates/letterHtmlTemplate');

let browserInstance = null;
let browserClosingTimeout = null;

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium-headless';

/**
 * Get or initialize a shared headless Chromium browser instance
 */
async function getBrowser() {
  if (browserClosingTimeout) {
    clearTimeout(browserClosingTimeout);
    browserClosingTimeout = null;
  }

  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  browserInstance = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--headless=new'
    ]
  });

  browserInstance.on('disconnected', () => {
    browserInstance = null;
  });

  return browserInstance;
}

/**
 * Keep browser warm or schedule idle shutdown after 2 minutes of inactivity
 */
function scheduleBrowserIdleClose() {
  if (browserClosingTimeout) clearTimeout(browserClosingTimeout);
  browserClosingTimeout = setTimeout(async () => {
    if (browserInstance && browserInstance.connected) {
      try {
        await browserInstance.close();
      } catch (_) {}
      browserInstance = null;
    }
  }, 120000); // 2 minutes idle
}

/**
 * Generate high-fidelity letterhead PDF for an official letter
 * @param {Object} params
 * @param {Object} params.letter - incident_letters record
 * @param {Object} [params.incident] - parent incident record
 * @param {Object} [params.approvers] - { draftedByName, approvedByName }
 * @param {string} [params.qrCodeDataUrl] - base64 QR code image
 * @param {boolean} [params.isDraft=false] - whether to print faint DRAFT watermark
 * @returns {Promise<Buffer>} A4 PDF Buffer
 */
async function generateLetterPdf({ letter, incident = {}, approvers = {}, qrCodeDataUrl = null, isDraft = false }) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    const htmlContent = buildLetterHtml({
      letter,
      incident,
      approvers,
      qrCodeDataUrl,
      isDraft
    });

    await page.setContent(htmlContent, {
      waitUntil: 'load',
      timeout: 30000
    });

    const refNumber = letter.reference_number || letter.ref_number || 'JPHRC/IMS';

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: getHeaderTemplate(),
      footerTemplate: getFooterTemplate(refNumber),
      margin: {
        top: '32mm',
        bottom: '24mm',
        left: '18mm',
        right: '18mm'
      }
    });

    return Buffer.from(pdfBuffer);
  } finally {
    try {
      await page.close();
    } catch (_) {}
    scheduleBrowserIdleClose();
  }
}

/**
 * Graceful shutdown for tests and process exit
 */
async function closeBrowser() {
  if (browserClosingTimeout) clearTimeout(browserClosingTimeout);
  if (browserInstance && browserInstance.connected) {
    try {
      await browserInstance.close();
    } catch (_) {}
    browserInstance = null;
  }
}

module.exports = {
  generateLetterPdf,
  closeBrowser
};
