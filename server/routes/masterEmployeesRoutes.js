const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const masterEmployeesController = require('../controllers/masterEmployeesController');

// GET all master employees (accessible to directory users)
router.get('/', authenticate, authorize('system_admin', 'imc', 'head_management'), masterEmployeesController.getAllEmployees);

// Manual employee creation and bulk upload are disabled:
// OfficePortal HRMS is the Single Source of Truth for all employee records.
router.post('/', authenticate, authorize('system_admin'), (req, res) => {
  res.status(405).json({
    error: 'Manual employee creation is disabled. Employee records are synchronized directly from OfficePortal HRMS.',
    code: 'HRMS_MANAGED_READ_ONLY'
  });
});

router.post('/bulk', authenticate, authorize('system_admin'), (req, res) => {
  res.status(405).json({
    error: 'Bulk employee upload is disabled. Employee records are synchronized directly from OfficePortal HRMS.',
    code: 'HRMS_MANAGED_READ_ONLY'
  });
});

// POST sync from HRMS Google Sheets API (admin only)
router.post('/sync-hrms', authenticate, authorize('system_admin'), masterEmployeesController.syncFromHrms);

// GET HRMS sync status (admin only)
router.get('/sync-status', authenticate, authorize('system_admin'), masterEmployeesController.getSyncStatus);

module.exports = router;

