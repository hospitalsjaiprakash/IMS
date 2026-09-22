const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const commonController = require('../controllers/commonController');

// Locations & Departments
router.get('/locations', authenticate, commonController.getLocations);
router.get('/departments', authenticate, commonController.getDepartments);

// Attachment download link generator
router.get('/attachments/:id/download', authenticate, commonController.downloadAttachment);

module.exports = router;
