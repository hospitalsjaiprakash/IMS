const express = require('express');
const router = express.Router();
const officePortalService = require('../services/officePortalService');

/**
 * @route   POST /api/webhooks/officeportal (or /webhooks/officeportal)
 * @desc    Ingest real-time signed webhooks from OfficePortal HRMS Public API v1
 * @access  Public (Authenticated via HMAC-SHA256 signature in X-Awarious-Signature)
 */
router.post('/officeportal', async (req, res) => {
  const signatureHeader = req.headers['x-awarious-signature'] || req.headers['X-Awarious-Signature'];

  if (!signatureHeader) {
    return res.status(401).json({
      error: 'Missing X-Awarious-Signature header'
    });
  }

  // Ensure rawBody buffer was captured by middleware
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body), 'utf8');

  try {
    const result = await officePortalService.handleWebhookDelivery(
      signatureHeader,
      rawBody,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: 'Webhook received and processed',
      eventsCount: result.processedEvents
    });
  } catch (err) {
    console.error('[OfficePortal Webhook] Processing failed:', err.message);
    const status = err.statusCode || 401;
    return res.status(status).json({
      error: err.message
    });
  }
});

module.exports = router;
