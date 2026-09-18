const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const canOperate = role => ['owner', 'admin', 'manager', 'agent', 'rep'].includes(role);
const canManage = role => ['owner', 'admin', 'manager'].includes(role);

router.get('/sessions', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ds.id, ds.campaign_id, ds.status, ds.started_at, ds.ended_at,
             c.name AS campaign_name,
             COUNT(ca.id)::int AS call_count
      FROM dialer_sessions ds
      LEFT JOIN campaigns c ON c.id = ds.campaign_id AND c.org_id = ds.org_id
      LEFT JOIN calls ca ON ca.session_id = ds.id AND ca.org_id = ds.org_id
      WHERE ds.org_id=$1 AND ds.user_id=$2
      GROUP BY ds.id, c.name
      ORDER BY ds.started_at DESC
      LIMIT $3`, [req.user.orgId, req.user.userId, Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)]);
    res.json({ items: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'DIALER_SESSIONS_LOAD_FAILED', message: 'Failed to load dialer sessions' } });
  }
});

router.post('/sessions', async (req, res) => {
  if (!canOperate(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Dialer access denied' } });
  const campaignId = req.body?.campaign_id || null;
  try {
    if (campaignId) {
      const campaign = await db.query('SELECT id FROM campaigns WHERE id=$1 AND org_id=$2', [campaignId, req.user.orgId]);
      if (!campaign.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
    }
    const result = await db.query(`INSERT INTO dialer_sessions(org_id,user_id,campaign_id,status) VALUES($1,$2,$3,'active') RETURNING *`, [req.user.orgId, req.user.userId, campaignId]);
    const session = result.rows[0];
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'dialer.session_started','dialer_session',$3,$4)`, [req.user.orgId, req.user.userId, session.id, { campaign_id: campaignId }]);
    res.status(201).json({ session });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'DIALER_SESSION_CREATE_FAILED', message: 'Failed to start dialer session' } });
  }
});

router.patch('/sessions/:id/end', async (req, res) => {
  try {
    const result = await db.query(`UPDATE dialer_sessions SET status='ended', ended_at=NOW() WHERE id=$1 AND org_id=$2 AND user_id=$3 AND status='active' RETURNING *`, [req.params.id, req.user.orgId, req.user.userId]);
    if (!result.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Active dialer session not found' } });
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'dialer.session_ended','dialer_session',$3,'{}')`, [req.user.orgId, req.user.userId, req.params.id]);
    res.json({ session: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'DIALER_SESSION_END_FAILED', message: 'Failed to end dialer session' } });
  }
});

router.get('/calls', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT ca.id, ca.lead_id, ca.session_id, ca.provider_call_id, ca.direction, ca.status,
             ca.disposition, ca.from_number, ca.to_number, ca.started_at, ca.ended_at,
             ca.duration_seconds, ca.created_at,
             l.lead_score, o.name AS owner_name, p.address AS property_address
      FROM calls ca
      LEFT JOIN leads l ON l.id=ca.lead_id AND l.org_id=ca.org_id
      LEFT JOIN owners o ON o.id=l.owner_id AND o.org_id=ca.org_id
      LEFT JOIN properties p ON p.id=l.property_id AND p.org_id=ca.org_id
      WHERE ca.org_id=$1
      ORDER BY ca.created_at DESC
      LIMIT $2`, [req.user.orgId, Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)]);
    res.json({ items: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'CALLS_LOAD_FAILED', message: 'Failed to load calls' } });
  }
});

router.post('/calls', async (req, res) => {
  if (!canOperate(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Dialer access denied' } });
  const leadId = String(req.body?.lead_id || '').trim();
  const sessionId = req.body?.session_id || null;
  if (!leadId) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'lead_id is required' } });
  try {
    const lead = await db.query(`SELECT l.id,l.phone FROM leads l WHERE l.id=$1 AND l.org_id=$2`, [leadId, req.user.orgId]);
    if (!lead.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Lead not found' } });
    if (!lead.rows[0].phone) return res.status(422).json({ error: { code: 'NO_CALLABLE_NUMBER', message: 'Lead has no callable phone number' } });
    if (sessionId) {
      const session = await db.query('SELECT id FROM dialer_sessions WHERE id=$1 AND org_id=$2 AND user_id=$3 AND status=\'active\'', [sessionId, req.user.orgId, req.user.userId]);
      if (!session.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Active dialer session not found' } });
    }
    const result = await db.query(`INSERT INTO calls(org_id,lead_id,user_id,session_id,direction,status,to_number) VALUES($1,$2,$3,$4,'outbound','queued',$5) RETURNING *`, [req.user.orgId, leadId, req.user.userId, sessionId, lead.rows[0].phone]);
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'call.queued','call',$3,$4)`, [req.user.orgId, req.user.userId, result.rows[0].id, { lead_id: leadId, session_id: sessionId }]);
    res.status(201).json({ call: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'CALL_CREATE_FAILED', message: 'Failed to queue call' } });
  }
});

router.patch('/calls/:id', async (req, res) => {
  if (!canOperate(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Dialer access denied' } });
  const allowedStatuses = new Set(['queued','ringing','in_progress','completed','failed','cancelled']);
  const status = req.body?.status == null ? null : String(req.body.status);
  const disposition = req.body?.disposition == null ? null : String(req.body.disposition).trim() || null;
  if (status && !allowedStatuses.has(status)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid call status' } });
  if (!status && disposition === null && req.body?.ended_at == null) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No call fields supplied' } });
  try {
    const result = await db.query(`
      UPDATE calls SET
        status=COALESCE($3,status),
        disposition=COALESCE($4,disposition),
        ended_at=CASE WHEN $3 IN ('completed','failed','cancelled') THEN COALESCE(ended_at,NOW()) ELSE ended_at END,
        duration_seconds=COALESCE($5,duration_seconds)
      WHERE id=$1 AND org_id=$2 AND user_id=$6
      RETURNING *`, [req.params.id, req.user.orgId, status, disposition, req.body?.duration_seconds == null ? null : Number(req.body.duration_seconds), req.user.userId]);
    if (!result.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Call not found' } });
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'call.updated','call',$3,$4)`, [req.user.orgId, req.user.userId, result.rows[0].id, { status, disposition }]);
    res.json({ call: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'CALL_UPDATE_FAILED', message: 'Failed to update call' } });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT COUNT(*)::int AS calls,
             COUNT(*) FILTER (WHERE status='completed')::int AS completed,
             COUNT(*) FILTER (WHERE status='in_progress')::int AS in_progress,
             COUNT(*) FILTER (WHERE disposition IS NOT NULL)::int AS dispositioned,
             COALESCE(SUM(duration_seconds),0)::int AS talk_time_seconds
      FROM calls WHERE org_id=$1 AND created_at >= COALESCE($2::timestamptz, CURRENT_DATE)`, [req.user.orgId, req.query.since || null]);
    res.json({ stats: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'DIALER_STATS_FAILED', message: 'Failed to load dialer statistics' } });
  }
});

module.exports = router;
