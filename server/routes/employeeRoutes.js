const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Employee Search & Directory (search is accessible to all authenticated users for incident reporting)
router.get('/employee/search', authenticate, adminController.searchEmployeeProfile);
router.get('/employees/directory', authenticate, authorize('imc', 'head_management', 'system_admin'), adminController.getAllUsers);

module.exports = router;
