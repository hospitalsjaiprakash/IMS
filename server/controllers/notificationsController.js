const { query } = require('../config/database');

exports.getNotifications = async (req, res) => {
  try {
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const [notifications, unreadCount, totalCountRes] = await Promise.all([
      query(
        `SELECT n.*, i.reference_id FROM notifications n
         LEFT JOIN incidents i ON i.id = n.incident_id
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limitNum, offset]
      ),
      query(
        'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
        [req.user.id]
      ),
      query(
        'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
        [req.user.id]
      )
    ]);

    const total = parseInt(totalCountRes.rows[0]?.count || '0', 10);
    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    res.json({
      notifications: notifications.rows,
      unreadCount: parseInt(unreadCount.rows[0]?.count || '0', 10),
      total,
      page: pageNum,
      totalPages
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
