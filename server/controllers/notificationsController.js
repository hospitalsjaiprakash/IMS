const { query } = require('../config/database');

exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const [notifications, unreadCount] = await Promise.all([
      query(
        `SELECT n.*, i.reference_id FROM notifications n
         LEFT JOIN incidents i ON i.id = n.incident_id
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      ),
      query(
        'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
        [req.user.id]
      )
    ]);

    res.json({
      notifications: notifications.rows,
      unreadCount: parseInt(unreadCount.rows[0].count)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === 'all') {
      await query(
        'UPDATE notifications SET is_read = TRUE WHERE user_id = $1',
        [req.user.id]
      );
    } else {
      await query(
        'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification' });
  }
};
