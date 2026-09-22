const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const knowledgeBaseController = require('../controllers/knowledgeBaseController');

router.get('/', authenticate, authorize('hod', 'imc', 'head_management', 'system_admin'), knowledgeBaseController.getKnowledgeBase);
router.post('/', authenticate, authorize('imc', 'system_admin'), knowledgeBaseController.createKnowledgeBase);

module.exports = router;
