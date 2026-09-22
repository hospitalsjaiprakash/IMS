const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const trainingController = require('../controllers/trainingController');

router.get('/', authenticate, trainingController.getTrainingRecords);
router.post('/:id/complete', authenticate, authorize('hod', 'imc'), trainingController.completeTrainingRecord);

module.exports = router;
