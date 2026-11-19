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

// POST sync from OfficePortal HRMS Public API v1 (admin only)
router.post('/sync-hrms', authenticate, authorize('system_admin'), masterEmployeesController.syncFromHrms);

// POST test OfficePortal OAuth connection & refresh live quota (admin only)
router.post('/test-connection', authenticate, authorize('system_admin'), masterEmployeesController.testConnection);

// PUT save/rotate OfficePortal credentials & webhook signing keys (admin only)
router.put('/hrms-config', authenticate, authorize('system_admin'), masterEmployeesController.updateHrmsConfig);

// GET HRMS sync status, masked config & quota telemetry (admin only)
router.get('/sync-status', authenticate, authorize('system_admin'), masterEmployeesController.getSyncStatus);

module.exports = router;

