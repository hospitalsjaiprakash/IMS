const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const commonController = require('../controllers/commonController');

// Locations, Departments, Designations & Employment Types (100% HRMS API-driven)
router.get('/locations', authenticate, commonController.getLocations);
router.get('/departments', authenticate, commonController.getDepartments);
router.get('/departments/designations', authenticate, commonController.getDesignations);
router.get('/departments/employment-types', authenticate, commonController.getEmploymentTypes);

// Attachment download and preview endpoints
router.get('/attachments/:id/download', authenticate, commonController.downloadAttachment);
router.get('/attachments/:id/preview', authenticate, commonController.previewAttachment);
router.get('/attachments/:id/view', authenticate, commonController.serveAttachmentFile);

module.exports = router;
