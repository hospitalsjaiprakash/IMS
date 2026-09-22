const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const { setUploadStage, uploadSingle } = require('../middleware/upload');

// Broadcast notifications
router.post(
  '/broadcast-notification',
  authenticate,
  authorize('system_admin'),
  setUploadStage('broadcast'),
  uploadSingle('attachment'),
  adminController.broadcastNotification
);
router.get('/broadcast-attachments/download', authenticate, adminController.downloadBroadcastAttachment);

// Attachment management
router.get('/attachments', authenticate, authorize('system_admin'), adminController.getAllAttachments);

// Analytics & Dashboard
router.get('/dashboard', authenticate, authorize('system_admin'), adminController.getSystemAnalytics);
router.get('/analytics', authenticate, authorize('system_admin'), adminController.getSystemAnalytics);

// System Config
router.get('/config', authenticate, authorize('system_admin'), adminController.getSystemConfig);
router.put('/config', authenticate, authorize('system_admin'), adminController.updateSystemConfig);

// Role Credentials & OTP
router.post('/role-credentials/otp', authenticate, authorize('system_admin'), adminController.requestPasswordChangeOtp);
router.put('/role-credentials', authenticate, authorize('system_admin'), adminController.updateRoleCredentials);

// IMC Members Management
router.get('/imc-members', authenticate, authorize('system_admin'), adminController.getImcMembers);
router.post('/assign-imc', authenticate, authorize('system_admin'), adminController.assignImcRole);
router.post('/assign-role', authenticate, authorize('system_admin'), adminController.assignUserRole);
router.delete('/imc-members/:id', authenticate, authorize('system_admin'), adminController.removeImcRole);
router.post('/stop-imc', authenticate, authorize('system_admin'), adminController.stopImcAccess);

// Audit & Analytics
router.get('/audit-logs/export', authenticate, authorize('system_admin'), adminController.exportAuditLogs);
router.get('/audit-logs', authenticate, authorize('system_admin'), adminController.getAuditLogs);
router.get('/role-audit', authenticate, authorize('system_admin'), adminController.getRoleAudit);

// Users Management
router.get('/users', authenticate, authorize('system_admin'), adminController.getAllUsers);
router.get('/users/:id/profile', authenticate, authorize('system_admin'), adminController.getUserProfile);
router.post('/users/:id/toggle-status', authenticate, authorize('system_admin'), adminController.toggleUserActiveStatus);

// Management Members
router.get('/management-members', authenticate, authorize('system_admin'), adminController.getManagementMembers);
router.delete('/management-members/:id', authenticate, authorize('system_admin'), adminController.removeManagementRole);

// Department Mapping
router.post('/map-department-leader', authenticate, authorize('system_admin'), adminController.mapDepartmentLeader);

// System Health & Master Data
router.get('/system-admins', authenticate, authorize('system_admin'), adminController.getSystemAdmins);
router.get('/system-health', authenticate, authorize('system_admin'), adminController.getSystemHealth);
router.get('/master-data', authenticate, authorize('system_admin'), adminController.getMasterData);
router.get('/communication-logs', authenticate, authorize('system_admin'), adminController.getCommunicationLogs);

module.exports = router;
