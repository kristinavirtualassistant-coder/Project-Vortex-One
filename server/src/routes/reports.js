const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');

const router = express.Router();
router.use(auth);

router.get('/overview', async (req, res) => {
  try {
    const orgId = req.user.orgId;
    const [totals, leads, calls, properties] = await Promise.all([
      db.query(`SELECT
        (SELECT COUNT(*)::int FROM properties WHERE org_id=$1) AS properties,
        (SELECT COUNT(*)::int FROM owners WHERE org_id=$1) AS owners,
        (SELECT COUNT(*)::int FROM leads WHERE org_id=$1) AS leads,
        (SELECT COUNT(*)::int FROM contacts WHERE org_id=$1) AS contacts,
        (SELECT COUNT(*)::int FROM calls WHERE org_id=$1) AS calls,
        (SELECT COUNT(*)::int FROM tasks WHERE org_id=$1 AND status IN ('open','in_progress')) AS open_tasks`, [orgId]),
      db.query(`SELECT status, COUNT(*)::int AS count FROM leads WHERE org_id=$1 GROUP BY status ORDER BY count DESC,status`, [orgId]),
      db.query(`SELECT COALESCE(disposition,'undispositioned') AS disposition, COUNT(*)::int AS count
                FROM calls WHERE org_id=$1 GROUP BY COALESCE(disposition,'undispositioned')
                ORDER BY count DESC, disposition`, [orgId]),
      db.query(`SELECT COALESCE(property_type,'unknown') AS property_type, COUNT(*)::int AS count
                FROM properties WHERE org_id=$1 GROUP BY COALESCE(property_type,'unknown')
                ORDER BY count DESC, property_type`, [orgId])
    ]);
    res.json({
      totals: totals.rows[0],
      lead_status: leads.rows,
      call_disposition: calls.rows,
      property_type: properties.rows,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'REPORT_FAILED', message: 'Unable to generate report' } });
  }
});

router.get('/activity', async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const result = await db.query(`
      SELECT DATE(created_at) AS date,
             COUNT(*)::int AS events,
             COUNT(*) FILTER (WHERE action LIKE 'call.%')::int AS calls,
             COUNT(*) FILTER (WHERE action LIKE 'task.%')::int AS tasks,
             COUNT(*) FILTER (WHERE action LIKE 'import.%')::int AS imports
      FROM audit_logs
      WHERE organization_id=$1 AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
      GROUP BY DATE(created_at)
      ORDER BY date DESC`, [req.user.orgId, days]);
    res.json({ days, items: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'REPORT_ACTIVITY_FAILED', message: 'Unable to generate activity report' } });
  }
});

module.exports = router;
