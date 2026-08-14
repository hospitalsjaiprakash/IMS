const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const authController = require('../controllers/authController');
const incidentsController = require('../controllers/incidentsController');
const incidentActionsController = require('../controllers/incidentActionsController');
const notificationsController = require('../controllers/notificationsController');
const adminController = require('../controllers/adminController');
const { query } = require('../config/database');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { s3Client } = require('../config/s3');

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes window
  max: 50, // Limit each IP to 50 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again after 5 minutes' }
});

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes window
  max: 50,
  message: { error: 'Too many login attempts from this IP, please try again after 5 minutes' }
});

const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

let upload;

if (s3Client && process.env.S3_BUCKET_NAME) {
  upload = multer({
    storage: multerS3({
      s3: s3Client,
      bucket: process.env.S3_BUCKET_NAME,
      metadata: function (req, file, cb) {
        cb(null, { fieldName: file.fieldname });
      },
      key: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
      }
    })
  });
} else {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    }
  });
  upload = multer({ storage: storage });
}
// ─── AUTH ─────────────────────────────────────────
router.use('/auth', authLimiter); // Apply rate limiter to all auth routes
router.post('/auth/register', authController.register);
router.post('/auth/login', loginLimiter, authController.login);
router.post('/auth/committee-login', loginLimiter, authController.committeeLogin);
router.post('/auth/switch-role', authenticate, authController.switchRole);
router.post('/auth/forgot-password', authController.forgotPasswordRequest);
router.post('/auth/reset-password', authController.resetPassword);
router.post('/auth/employee-forgot-password', authController.requestEmployeePasswordReset);
router.post('/auth/employee-reset-password', authController.resetEmployeePassword);
router.post('/auth/change-password-otp', authenticate, authController.requestChangePasswordOtp);
router.get('/auth/me', authenticate, authController.getMe);
router.get('/auth/committee-members', authenticate, authController.getCommitteeMembers);
router.post('/auth/leave-role', authenticate, authController.leaveRole);
router.put('/auth/notification-prefs', authenticate, authController.updateNotificationPrefs);
router.put('/auth/contact-info', authenticate, authController.updateContactInfo);

// ─── INCIDENTS ────────────────────────────────────
router.get('/incidents', authenticate, incidentsController.getIncidents);
router.post('/incidents', authenticate, upload.array('attachments', 10), incidentsController.createIncident);
router.get('/incidents/stats', authenticate, incidentsController.getDashboardStats);
router.get('/incidents/export', authenticate, incidentsController.exportIncidents);
router.get('/incidents/:id', authenticate, incidentsController.getIncident);

// Employee: edit own incident while submitted
router.put('/incidents/:id', authenticate, incidentActionsController.updateIncident);

// Employee: withdraw incident
router.post('/incidents/:id/withdraw', authenticate, incidentsController.withdrawIncident);

// HOD: submit feedback
router.post('/incidents/:id/hod-feedback', authenticate, authorize('hod'), upload.array('attachments', 10), incidentsController.submitHodFeedback);

// HOD: request redirect to IMC
router.post('/incidents/:id/request-redirect', authenticate, authorize('hod'), incidentActionsController.requestRedirect);

// ─── MODULAR HOD ALIASES (Chapter 6 Specification) ───
router.get('/hod/dashboard', authenticate, authorize('hod'), incidentsController.getDashboardStats);
router.get('/hod/incidents', authenticate, authorize('hod'), incidentsController.getIncidents);
router.get('/hod/incidents/export', authenticate, authorize('hod'), incidentsController.exportIncidents);
router.get('/hod/incidents/:id', authenticate, authorize('hod'), incidentsController.getIncident);
router.post('/hod/incidents/:id/feedback', authenticate, authorize('hod'), upload.array('attachments', 10), incidentsController.submitHodFeedback);
router.post('/hod/incidents/:id/redirect', authenticate, authorize('hod'), incidentActionsController.requestRedirect);

// IMC: claim, feedback, approve/reject redirect, verify training, assign investigator
router.post('/incidents/:id/claim', authenticate, authorize('imc'), incidentsController.claimIncident);
router.post('/incidents/:id/imc-feedback', authenticate, authorize('imc'), upload.array('attachments', 10), incidentsController.submitImcFeedback);
router.post('/incidents/:id/approve-redirect', authenticate, authorize('imc'), incidentActionsController.approveRedirect);
router.post('/incidents/:id/reject-redirect', authenticate, authorize('imc'), incidentActionsController.rejectRedirect);
router.post('/incidents/:id/verify-training', authenticate, authorize('imc'), incidentActionsController.verifyTraining);

// ─── MODULAR IMC ALIASES (Chapter 7 Specification) ───
router.get('/imc/dashboard', authenticate, authorize('imc'), incidentsController.getDashboardStats);
router.get('/imc/incidents', authenticate, authorize('imc'), incidentsController.getIncidents);
router.get('/imc/incidents/export', authenticate, authorize('imc'), incidentsController.exportIncidents);
router.get('/imc/incidents/:id', authenticate, authorize('imc'), incidentsController.getIncident);
router.post('/imc/incidents/:id/claim', authenticate, authorize('imc'), incidentsController.claimIncident);
router.post('/imc/incidents/:id/feedback', authenticate, authorize('imc'), upload.array('attachments', 10), incidentsController.submitImcFeedback);
router.post('/imc/incidents/:id/redirect/approve', authenticate, authorize('imc'), incidentActionsController.approveRedirect);
router.post('/imc/incidents/:id/redirect/reject', authenticate, authorize('imc'), incidentActionsController.rejectRedirect);
router.post('/imc/incidents/:id/verify-training', authenticate, authorize('imc'), incidentActionsController.verifyTraining);
router.post('/imc/incidents/:id/remind-hod', authenticate, authorize('imc'), incidentActionsController.remindHod);

// IMC/Management: escalate priority
router.post('/incidents/:id/escalate-priority', authenticate, authorize('imc', 'head_management'), incidentActionsController.escalatePriority);

// IMC/Management: remind HOD to give feedback
router.post('/incidents/:id/remind-hod', authenticate, authorize('imc', 'head_management'), incidentActionsController.remindHod);

// IMC/Management: reopen
router.post('/incidents/:id/reopen', authenticate, authorize('head_management', 'imc'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason is required to re-open an incident.' });
    await query(
      `UPDATE incidents SET status = 'with_imc', updated_at = NOW() WHERE id = $1 AND status = 'resolved'`,
      [id]
    );
    const { auditLog } = require('../middleware/auth');
    await auditLog(req.user.id, 'INCIDENT_REOPENED', id, { reason }, req.ip);
    res.json({ success: true });
  } catch (e) { console.error('[POST /incidents/:id/reopen] error:', e); res.status(500).json({ error: 'Failed to reopen' }); }
});

// Bulk Update Status


// HOD/IMC/Management: edit own feedback
router.put('/incidents/:id/feedback', authenticate, authorize('hod', 'imc', 'head_management'), incidentActionsController.editFeedback);

// Management: final decision
router.post('/incidents/:id/md-decision', authenticate, authorize('head_management'), upload.array('attachments', 10), incidentsController.submitMdDecision);

// ─── MODULAR MANAGEMENT ALIASES (Chapter 8 Specification) ───
router.get('/management/dashboard', authenticate, authorize('head_management'), incidentsController.getDashboardStats);
router.get('/management/incidents', authenticate, authorize('head_management'), incidentsController.getIncidents);
router.get('/management/incidents/export', authenticate, authorize('head_management'), incidentsController.exportIncidents);
router.get('/management/incidents/:id', authenticate, authorize('head_management'), incidentsController.getIncident);
router.post('/management/incidents/:id/decision', authenticate, authorize('head_management'), upload.array('attachments', 10), incidentsController.submitMdDecision);
router.post('/management/incidents/:id/escalate', authenticate, authorize('head_management'), incidentActionsController.escalatePriority);
router.post('/management/incidents/:id/remind-hod', authenticate, authorize('head_management'), incidentActionsController.remindHod);


// IMC: assign investigator
router.post('/incidents/:id/assign-investigator', authenticate, authorize('imc'), async (req, res) => {
  try {
    const { id } = req.params;
    const { investigatorId } = req.body;
    const eligibleDesignations = ['Supervisor', 'Senior', 'HOD'];
    const inv = await query(
      'SELECT * FROM users WHERE id = $1 AND (role = $2 OR designation ILIKE ANY($3))',
      [investigatorId, 'imc', eligibleDesignations]
    );
    if (!inv.rows.length) {
      return res.status(400).json({ error: 'Investigator must be an IMC member or have Supervisor/Senior/HOD designation.' });
    }
    await query(
      `INSERT INTO investigators (incident_id, investigator_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [id, investigatorId, req.user.id]
    );
    res.json({ success: true });
  } catch (e) { console.error('[POST /incidents/:id/assign-investigator] error:', e); res.status(500).json({ error: 'Failed to assign investigator' }); }
});

// ─── NOTIFICATIONS ────────────────────────────────
router.get('/notifications', authenticate, notificationsController.getNotifications);
router.put('/notifications/:id/read', authenticate, notificationsController.markAsRead);

// ─── LOCATIONS & DEPARTMENTS ──────────────────────
router.get('/locations', authenticate, async (req, res) => {
  try {
    const [main, sub] = await Promise.all([
      query('SELECT * FROM main_locations ORDER BY name'),
      query('SELECT * FROM sub_locations ORDER BY name')
    ]);
    res.json({ mainLocations: main.rows, subLocations: sub.rows });
  } catch (e) { console.error('[GET /locations] error:', e); res.status(500).json({ error: 'Failed' }); }
});

router.get('/departments', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, 
         u1.full_name as hod_name, u1.employee_id as hod_employee_id,
         u2.full_name as incharge_name, u2.employee_id as incharge_employee_id,
         u3.full_name as asst_coo_name, u3.employee_id as asst_coo_employee_id
       FROM departments d
       LEFT JOIN users u1 ON u1.id = d.hod_user_id
       LEFT JOIN users u2 ON u2.id = d.incharge_user_id
       LEFT JOIN users u3 ON u3.id = d.asst_coo_user_id
       ORDER BY d.name`
    );
    res.json(result.rows);
  } catch (e) { console.error('[GET /departments] error:', e); res.status(500).json({ error: 'Failed' }); }
});

// ─── KNOWLEDGE BASE ───────────────────────────────
router.get('/knowledge-base', authenticate, authorize('hod', 'imc', 'head_management', 'system_admin'), async (req, res) => {
  try {
    const { search, incidentType, departmentId, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params = [];
    let idx = 1;

    if (search) {
      where += ` AND (kb.title ILIKE $${idx} OR kb.root_cause ILIKE $${idx} OR kb.tags ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (incidentType) { where += ` AND kb.incident_type = $${idx++}`; params.push(incidentType); }
    if (departmentId) { where += ` AND kb.department_id = $${idx++}`; params.push(departmentId); }

    const result = await query(
      `SELECT kb.*, u.full_name as created_by_name, d.name as department_name, i.reference_id
       FROM knowledge_base kb
       JOIN users u ON u.id = kb.created_by
       LEFT JOIN departments d ON d.id = kb.department_id
       LEFT JOIN incidents i ON i.id = kb.incident_id
       WHERE ${where}
       ORDER BY kb.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM knowledge_base kb WHERE ${where}`, params
    );

    res.json({
      entries: result.rows,
      total: parseInt(countResult.rows[0].count),
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    });
  } catch (e) { console.error('[GET /knowledge-base] error:', e); res.status(500).json({ error: 'Failed' }); }
});

router.post('/knowledge-base', authenticate, authorize('imc'), async (req, res) => {
  try {
    const { incidentId, title, incidentType, departmentId, rootCause, preventiveActions, tags } = req.body;
    await query(
      `INSERT INTO knowledge_base (incident_id, created_by, title, incident_type, department_id, root_cause, preventive_actions, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [incidentId || null, req.user.id, title, incidentType, departmentId || null, rootCause, preventiveActions, tags]
    );
    res.status(201).json({ success: true });
  } catch (e) { console.error('[POST /knowledge-base] error:', e); res.status(500).json({ error: 'Failed' }); }
});

// ─── ADMIN ────────────────────────────────────────
router.get('/admin/attachments', authenticate, authorize('system_admin'), adminController.getAllAttachments);
router.get('/admin/dashboard', authenticate, authorize('system_admin'), adminController.getSystemAnalytics);
router.get('/admin/config', authenticate, authorize('system_admin'), adminController.getSystemConfig);
router.put('/admin/config', authenticate, authorize('system_admin'), adminController.updateSystemConfig);
router.post('/admin/role-credentials/otp', authenticate, authorize('system_admin'), adminController.requestPasswordChangeOtp);
router.put('/admin/role-credentials', authenticate, authorize('system_admin'), adminController.updateRoleCredentials);
router.get('/admin/imc-members', authenticate, authorize('system_admin'), adminController.getImcMembers);
router.post('/admin/assign-imc', authenticate, authorize('system_admin'), adminController.assignImcRole);
router.post('/admin/assign-role', authenticate, authorize('system_admin'), adminController.assignUserRole);
router.delete('/admin/imc-members/:id', authenticate, authorize('system_admin'), adminController.removeImcRole);
router.post('/admin/stop-imc', authenticate, authorize('system_admin'), adminController.stopImcAccess);
router.get('/admin/audit-logs/export', authenticate, authorize('system_admin'), adminController.exportAuditLogs);
router.get('/admin/audit-logs', authenticate, authorize('system_admin'), adminController.getAuditLogs);
router.get('/admin/analytics', authenticate, authorize('system_admin'), adminController.getSystemAnalytics);
router.get('/admin/users', authenticate, authorize('system_admin'), adminController.getAllUsers);
router.post('/admin/users/:id/toggle-status', authenticate, authorize('system_admin'), adminController.toggleUserActiveStatus);
router.get('/admin/role-audit', authenticate, authorize('system_admin'), adminController.getRoleAudit);
router.get('/admin/management-members', authenticate, authorize('system_admin'), adminController.getManagementMembers);
router.delete('/admin/management-members/:id', authenticate, authorize('system_admin'), adminController.removeManagementRole);
router.post('/admin/map-department-leader', authenticate, authorize('system_admin'), adminController.mapDepartmentLeader);
router.get('/admin/system-admins', authenticate, authorize('system_admin'), adminController.getSystemAdmins);
router.get('/admin/system-health', authenticate, authorize('system_admin'), adminController.getSystemHealth);
router.get('/admin/master-data', authenticate, authorize('system_admin'), adminController.getMasterData);
router.get('/admin/communication-logs', authenticate, authorize('system_admin'), adminController.getCommunicationLogs);
// ─── EMPLOYEE SEARCH & DIRECTORY ───────────────────
router.get('/employee/search', authenticate, authorize('imc', 'head_management', 'system_admin'), adminController.searchEmployeeProfile);
router.get('/employees/directory', authenticate, authorize('imc', 'head_management', 'system_admin'), adminController.getAllUsers);


// ─── IMC QUEUE ────────────────────────────────────
router.get('/imc/queue', authenticate, authorize('imc'), async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*,
        u.full_name as reporter_name, u.employee_id as reporter_employee_id,
        ml.name as main_location_name,
        ARRAY_AGG(DISTINCT d.name) as departments,
        ic.claimed_by as claimed_by_id,
        cu.full_name as claimed_by_name,
        ic.expires_at as claim_expires_at,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'hod') as has_hod_feedback,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'imc') as has_imc_feedback,
        EXISTS(SELECT 1 FROM feedbacks f WHERE f.incident_id = i.id AND f.role = 'head_management') as has_management_feedback
       FROM incidents i
       LEFT JOIN users u ON u.id = i.reporter_id
       LEFT JOIN main_locations ml ON ml.id = i.main_location_id
       LEFT JOIN incident_departments id ON id.incident_id = i.id
       LEFT JOIN departments d ON d.id = id.department_id
       LEFT JOIN imc_claims ic ON ic.incident_id = i.id AND ic.is_active = TRUE AND ic.expires_at > NOW()
       LEFT JOIN users cu ON cu.id = ic.claimed_by
       WHERE i.status IN ('with_imc', 'redirect_requested', 'with_hod_and_imc', 'pending_training')
          OR (i.status = 'resolved' AND i.has_responsible_person = TRUE AND i.training_completed = FALSE)
       GROUP BY i.id, u.full_name, u.employee_id, ml.name, ic.claimed_by, cu.full_name, ic.expires_at
       ORDER BY i.created_at ASC`
    );
    res.json(result.rows);
  } catch (e) { console.error('[GET /imc/queue] error:', e); res.status(500).json({ error: 'Failed' }); }
});

// ─── TRAINING ─────────────────────────────────────
router.get('/training', authenticate, async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    let where = '1=1';
    const params = [];

    if (role === 'hod') {
      where = `u.department = (SELECT department FROM users WHERE id = $1)`;
      params.push(userId);
    } else if (role === 'employee') {
      where = `tr.employee_id = $1`;
      params.push(userId);
    }

    const result = await query(
      `SELECT tr.*, u.full_name as employee_name, u.department,
        i.reference_id, ab.full_name as assigned_by_name
       FROM training_records tr
       JOIN users u ON u.id = tr.employee_id
       JOIN incidents i ON i.id = tr.incident_id
       JOIN users ab ON ab.id = tr.assigned_by
       WHERE ${where}
       ORDER BY tr.assigned_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (e) { console.error('[GET /training] error:', e); res.status(500).json({ error: 'Failed' }); }
});

router.post('/training/:id/complete', authenticate, authorize('hod', 'imc'), async (req, res) => {
  try {
    await query(
      `UPDATE training_records SET completed = TRUE, completed_at = NOW(), completed_by = $1 WHERE id = $2`,
      [req.user.id, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { console.error('[POST /training/:id/complete] error:', e); res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
