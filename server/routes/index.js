const express = require('express');
const router = express.Router();

// Domain route modules
const authRoutes = require('./authRoutes');
const incidentRoutes = require('./incidentRoutes');
const roleWorkflowRoutes = require('./roleWorkflowRoutes');
const adminRoutes = require('./adminRoutes');
const employeeRoutes = require('./employeeRoutes');
const notificationRoutes = require('./notificationRoutes');
const masterEmployeesRoutes = require('./masterEmployeesRoutes');
const knowledgeBaseRoutes = require('./knowledgeBaseRoutes');
const trainingRoutes = require('./trainingRoutes');
const commonRoutes = require('./commonRoutes');

// Mount domain routes
router.use('/auth', authRoutes);
router.use('/incidents', incidentRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/master-employees', masterEmployeesRoutes);
router.use('/knowledge-base', knowledgeBaseRoutes);
router.use('/training', trainingRoutes);

// Role workflows (/hod, /imc, /management), employee search/directory, locations & common utilities
router.use('/', roleWorkflowRoutes);
router.use('/', employeeRoutes);
router.use('/', commonRoutes);

module.exports = router;
