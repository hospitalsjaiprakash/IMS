const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Employee Search & Directory
router.get('/employee/search', authenticate, authorize('imc', 'head_management', 'system_admin'), adminController.searchEmployeeProfile);
router.get('/employees/directory', authenticate, authorize('imc', 'head_management', 'system_admin'), adminController.getAllUsers);

module.exports = router;
