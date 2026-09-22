const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const incidentsController = require('../controllers/incidentsController');
const incidentWorkflowController = require('../controllers/incidentWorkflowController');
const incidentActionsController = require('../controllers/incidentActionsController');
const { setUploadStage, uploadIncidentAttachments } = require('../middleware/upload');

// Base list, create, stats, export
router.get('/', authenticate, incidentsController.getIncidents);
router.post('/', authenticate, setUploadStage('submission'), uploadIncidentAttachments, incidentsController.createIncident);
router.get('/stats', authenticate, incidentsController.getDashboardStats);
router.get('/export', authenticate, incidentsController.exportIncidents);
router.get('/:id', authenticate, incidentsController.getIncident);

// Employee actions
router.put('/:id', authenticate, incidentActionsController.updateIncident);
router.post('/:id/withdraw', authenticate, incidentsController.withdrawIncident);

// HOD actions
router.post('/:id/hod-feedback', authenticate, authorize('hod'), setUploadStage('hod_feedback'), uploadIncidentAttachments, incidentWorkflowController.submitHodFeedback);
router.post('/:id/request-redirect', authenticate, authorize('hod'), incidentActionsController.requestRedirect);

// Feedback edit
router.put('/:id/feedback', authenticate, authorize('hod', 'imc', 'head_management'), incidentActionsController.editFeedback);

// IMC & Admin actions
router.post('/:id/claim', authenticate, authorize('imc', 'system_admin'), incidentWorkflowController.claimIncident);
router.post('/:id/imc-feedback', authenticate, authorize('imc', 'system_admin'), setUploadStage('imc_feedback'), uploadIncidentAttachments, incidentWorkflowController.submitImcFeedback);
router.post('/:id/approve-redirect', authenticate, authorize('imc', 'system_admin'), incidentActionsController.approveRedirect);
router.post('/:id/reject-redirect', authenticate, authorize('imc', 'system_admin'), incidentActionsController.rejectRedirect);
router.post('/:id/verify-training', authenticate, authorize('imc', 'system_admin', 'hod'), incidentActionsController.verifyTraining);
router.post('/:id/verify-employee-training', authenticate, authorize('imc', 'system_admin', 'hod'), incidentActionsController.verifyEmployeeTraining);
router.post('/:id/report', authenticate, authorize('imc', 'system_admin'), setUploadStage('imc_report'), uploadIncidentAttachments, incidentWorkflowController.generateImcReport);
router.post('/:id/close', authenticate, authorize('imc', 'system_admin'), incidentWorkflowController.closeIncident);

// Investigator workflow
router.post('/:id/assign-investigator', authenticate, authorize('imc', 'system_admin'), incidentWorkflowController.assignInvestigator);
router.post('/:id/investigator-report', authenticate, authorize('imc', 'system_admin'), setUploadStage('investigator_report'), uploadIncidentAttachments, incidentWorkflowController.submitInvestigatorReport);
router.post('/:id/reject-investigator-report', authenticate, authorize('imc', 'system_admin'), incidentWorkflowController.rejectInvestigatorReport);

// Escalation, reminders & reopen
router.post('/:id/escalate-priority', authenticate, authorize('imc', 'head_management'), incidentActionsController.escalatePriority);
router.post('/:id/remind-hod', authenticate, authorize('imc', 'head_management'), incidentActionsController.remindHod);
router.post('/:id/reopen', authenticate, authorize('head_management', 'imc'), incidentWorkflowController.reopenIncident);

// Management action
router.post('/:id/management-action', authenticate, authorize('head_management'), incidentWorkflowController.submitManagementAction);

module.exports = router;
