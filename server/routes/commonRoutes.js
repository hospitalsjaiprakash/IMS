const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const commonController = require('../controllers/commonController');

// Locations, Categories, Departments, Designations & Employment Types
router.get('/locations', authenticate, commonController.getLocations);
router.get('/categories', authenticate, commonController.getCategories);
router.get('/departments', authenticate, commonController.getDepartments);
router.get('/departments/designations', authenticate, commonController.getDesignations);
router.get('/departments/employment-types', authenticate, commonController.getEmploymentTypes);

// Attachment download and preview endpoints
router.get('/attachments/:id/download', authenticate, commonController.downloadAttachment);
router.get('/attachments/:id/preview', authenticate, commonController.previewAttachment);
router.get('/attachments/:id/view', authenticate, commonController.serveAttachmentFile);

module.exports = router;
