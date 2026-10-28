const QRCode = require('qrcode');

/**
 * Generate QR Code data URL embedding the specific incident URL in IMS
 * @param {string} incidentId - UUID of the incident
 * @returns {Promise<string>} Base64 Data URL of the QR code
 */
async function generateIncidentQrCode(incidentId) {
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const incidentUrl = `${baseUrl.replace(/\/$/, '')}/incidents/${incidentId}`;
  
  try {
    const dataUrl = await QRCode.toDataURL(incidentUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });
    return dataUrl;
  } catch (err) {
    console.error('[QRCodeService] Failed to generate QR code:', err);
    return null;
  }
}

/**
 * Returns the incident URL for linking
 */
function getIncidentUrl(incidentId) {
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  return `${baseUrl.replace(/\/$/, '')}/incidents/${incidentId}`;
}

module.exports = {
  generateIncidentQrCode,
  getIncidentUrl
};
