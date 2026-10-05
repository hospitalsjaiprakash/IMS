const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const commonController = require('../controllers/commonController');

// Locations & Departments
router.get('/locations', authenticate, commonController.getLocations);
router.get('/departments', authenticate, commonController.getDepartments);

// Attachment download and preview endpoints
router.get('/attachments/:id/download', authenticate, commonController.downloadAttachment);
router.get('/attachments/:id/preview', authenticate, commonController.previewAttachment);
router.get('/attachments/:id/view', commonController.serveAttachmentFile);

module.exports = router;
