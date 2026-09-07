const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const masterEmployeesController = require('../controllers/masterEmployeesController');

// GET all master employees (accessible to directory users)
router.get('/', authenticate, authorize('system_admin', 'imc', 'head_management'), masterEmployeesController.getAllEmployees);

// POST add single employee (admin only)
router.post('/', authenticate, authorize('system_admin'), masterEmployeesController.addEmployee);

// POST bulk add employees (admin only)
router.post('/bulk', authenticate, authorize('system_admin'), masterEmployeesController.bulkAddEmployees);

module.exports = router;
