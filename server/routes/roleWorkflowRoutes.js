const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const incidentsController = require('../controllers/incidentsController');
const incidentWorkflowController = require('../controllers/incidentWorkflowController');
const incidentActionsController = require('../controllers/incidentActionsController');
const { setUploadStage, uploadIncidentAttachments } = require('../middleware/upload');

// ─── HOD ALIASES ─────────────────────────────────────
router.get('/hod/dashboard', authenticate, authorize('hod'), incidentsController.getDashboardStats);
router.get('/hod/team', authenticate, authorize('hod'), incidentsController.getHodTeam);
router.get('/hod/incidents', authenticate, authorize('hod'), incidentsController.getIncidents);
router.get('/hod/incidents/export', authenticate, authorize('hod'), incidentsController.exportIncidents);
router.get('/hod/incidents/:id', authenticate, authorize('hod'), incidentsController.getIncident);
router.post('/hod/incidents/:id/feedback', authenticate, authorize('hod'), setUploadStage('hod_feedback'), uploadIncidentAttachments, incidentWorkflowController.submitHodFeedback);
router.post('/hod/incidents/:id/redirect', authenticate, authorize('hod'), incidentActionsController.requestRedirect);

// ─── IMC ALIASES ─────────────────────────────────────
router.get('/imc/dashboard', authenticate, authorize('imc', 'system_admin'), incidentsController.getDashboardStats);
router.get('/imc/incidents', authenticate, authorize('imc', 'system_admin'), incidentsController.getIncidents);
router.get('/imc/incidents/export', authenticate, authorize('imc', 'system_admin'), incidentsController.exportIncidents);
router.get('/imc/incidents/:id', authenticate, authorize('imc', 'system_admin'), incidentsController.getIncident);
router.post('/imc/incidents/:id/claim', authenticate, authorize('imc', 'system_admin'), incidentWorkflowController.claimIncident);
router.post('/imc/incidents/:id/feedback', authenticate, authorize('imc', 'system_admin'), setUploadStage('imc_feedback'), uploadIncidentAttachments, incidentWorkflowController.submitImcFeedback);
router.post('/imc/incidents/:id/redirect/approve', authenticate, authorize('imc', 'system_admin'), incidentActionsController.approveRedirect);
router.post('/imc/incidents/:id/redirect/reject', authenticate, authorize('imc', 'system_admin'), incidentActionsController.rejectRedirect);
router.post('/imc/incidents/:id/verify-training', authenticate, authorize('imc', 'system_admin'), incidentActionsController.verifyTraining);
router.post('/imc/incidents/:id/remind-hod', authenticate, authorize('imc', 'system_admin'), incidentActionsController.remindHod);
router.post('/imc/incidents/:id/report', authenticate, authorize('imc', 'system_admin'), setUploadStage('imc_report'), uploadIncidentAttachments, incidentWorkflowController.generateImcReport);
router.post('/imc/incidents/:id/close', authenticate, authorize('imc', 'system_admin'), incidentWorkflowController.closeIncident);
router.get('/imc/queue', authenticate, authorize('imc', 'system_admin'), incidentWorkflowController.getImcQueue);

// ─── MANAGEMENT ALIASES ──────────────────────────────
router.get('/management/dashboard', authenticate, authorize('head_management'), incidentsController.getDashboardStats);
router.get('/management/incidents', authenticate, authorize('head_management'), incidentsController.getIncidents);
router.get('/management/incidents/export', authenticate, authorize('head_management'), incidentsController.exportIncidents);
router.get('/management/incidents/:id', authenticate, authorize('head_management'), incidentsController.getIncident);
router.post('/management/incidents/:id/decision', authenticate, authorize('head_management'), incidentWorkflowController.submitManagementAction);
router.post('/management/incidents/:id/escalate', authenticate, authorize('head_management'), incidentActionsController.escalatePriority);
router.post('/management/incidents/:id/remind-hod', authenticate, authorize('head_management'), incidentActionsController.remindHod);

module.exports = router;
