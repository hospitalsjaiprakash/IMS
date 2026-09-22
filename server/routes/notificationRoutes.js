const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const notificationsController = require('../controllers/notificationsController');

router.get('/', authenticate, notificationsController.getNotifications);
router.put('/:id/read', authenticate, notificationsController.markAsRead);

module.exports = router;
