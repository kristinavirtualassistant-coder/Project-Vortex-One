const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const ringCentral = require('../services/ringcentral');

const router = express.Router();
router.use(auth);

const canOperate = role => ['owner', 'admin', 'manager', 'rep'].includes(role);
const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);

async function syncCampaignLeadStatus(callId, status) {
  const campaignStatus = status === 'completed' ? 'completed' : status === 'failed' || status === 'cancelled' ? 'failed' : status === 'queued' ? 'queued' : 'calling';
  await db.query(`UPDATE campaign_leads cl SET status=$2 WHERE cl.lead_id=(SELECT lead_id FROM calls WHERE id=$1) AND cl.campaign_id=(SELECT ds.campaign_id FROM calls ca JOIN dialer_sessions ds ON ds.id=ca.session_id AND ds.org_id=ca.org_id WHERE ca.id=$1)`, [callId, campaignStatus]);
}

function mapProviderStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['success', 'completed', 'disconnected'].includes(value)) return 'completed';
  if (['failed', 'error', 'busy', 'noanswer', 'no answer', 'rejected'].includes(value)) return 'failed';
  if (['ringing', 'proceeding', 'setup', 'inprogress', 'in progress'].includes(value)) return 'in_progress';
  return 'queued';
}

async function assertLead(orgId, leadId) {
  const result = await db.query('SELECT id,phone FROM leads WHERE id=$1 AND org_id=$2', [leadId, orgId]);
  return result.rows[0] || null;
}

router.get('/sessions', async (req, res) => {
  try {
    const result = await db.query(`SELECT ds.id,ds.campaign_id,ds.status,ds.started_at,ds.ended_at,c.name AS campaign_name,COUNT(ca.id)::int AS call_count FROM dialer_sessions ds LEFT JOIN campaigns c ON c.id=ds.campaign_id AND c.org_id=ds.org_id LEFT JOIN calls ca ON ca.session_id=ds.id AND ca.org_id=ds.org_id WHERE ds.org_id=$1 AND ds.user_id=$2 GROUP BY ds.id,c.name ORDER BY ds.started_at DESC LIMIT $3`, [req.user.orgId, req.user.userId, Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)]);
    res.json({ items: result.rows });
  } catch (error) { console.error(error); res.status(500).json({ error: { code: 'DIALER_SESSIONS_LOAD_FAILED', message: 'Failed to load dialer sessions' } }); }
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
  } catch (error) { console.error(error); res.status(500).json({ error: { code: 'DIALER_SESSION_CREATE_FAILED', message: 'Failed to start dialer session' } }); }
});

router.patch('/sessions/:id/end', async (req, res) => {
  try {
    const result = await db.query(`UPDATE dialer_sessions SET status='ended',ended_at=NOW() WHERE id=$1 AND org_id=$2 AND user_id=$3 AND status='active' RETURNING *`, [req.params.id, req.user.orgId, req.user.userId]);
    if (!result.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Active dialer session not found' } });
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'dialer.session_ended','dialer_session',$3,'{}')`, [req.user.orgId, req.user.userId, req.params.id]);
    res.json({ session: result.rows[0] });
  } catch (error) { console.error(error); res.status(500).json({ error: { code: 'DIALER_SESSION_END_FAILED', message: 'Failed to end dialer session' } }); }
});

router.get('/calls', async (req, res) => {
  try {
    const result = await db.query(`SELECT ca.id,ca.lead_id,ca.session_id,ca.provider_call_id,ca.direction,ca.status,ca.disposition,ca.from_number,ca.to_number,ca.started_at,ca.ended_at,ca.duration_seconds,ca.created_at,l.lead_score,o.name AS owner_name,p.address AS property_address FROM calls ca LEFT JOIN leads l ON l.id=ca.lead_id AND l.org_id=ca.org_id LEFT JOIN owners o ON o.id=l.owner_id AND o.org_id=ca.org_id LEFT JOIN properties p ON p.id=l.property_id AND p.org_id=ca.org_id WHERE ca.org_id=$1 ORDER BY ca.created_at DESC LIMIT $2`, [req.user.orgId, Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)]);
    res.json({ items: result.rows });
  } catch (error) { console.error(error); res.status(500).json({ error: { code: 'CALLS_LOAD_FAILED', message: 'Failed to load calls' } }); }
});

router.post('/calls', async (req, res) => {
  if (!canOperate(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Dialer access denied' } });
  const leadId = String(req.body?.lead_id || '').trim();
  const sessionId = req.body?.session_id || null;
  if (!leadId) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'lead_id is required' } });
  try {
    const lead = await assertLead(req.user.orgId, leadId);
    if (!lead) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Lead not found' } });
    if (!lead.phone) return res.status(422).json({ error: { code: 'NO_CALLABLE_NUMBER', message: 'Lead has no callable phone number' } });
    if (sessionId) {
      const session = await db.query('SELECT id FROM dialer_sessions WHERE id=$1 AND org_id=$2 AND user_id=$3 AND status=\'active\'', [sessionId, req.user.orgId, req.user.userId]);
      if (!session.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Active dialer session not found' } });
    }

    const result = await db.query(`INSERT INTO calls(org_id,lead_id,user_id,session_id,direction,status,to_number,from_number) VALUES($1,$2,$3,$4,'outbound','queued',$5,$6) RETURNING *`, [req.user.orgId, leadId, req.user.userId, sessionId, lead.phone, process.env.DEFAULT_CALLER_ID || null]);
    const call = result.rows[0];
    let execution = { status: 'queued', provider: 'not_configured' };

    if (ringCentral.configured()) {
      try {
        const provider = await ringCentral.placeRingOut({ toNumber: lead.phone, fromNumber: process.env.DEFAULT_CALLER_ID || undefined });
        const mappedStatus = mapProviderStatus(provider.callStatus);
        const updated = await db.query(`UPDATE calls SET provider_call_id=$3,status=$4,started_at=CASE WHEN $4 IN ('ringing','in_progress','completed') THEN COALESCE(started_at,NOW()) ELSE started_at END,ended_at=CASE WHEN $4 IN ('completed','failed') THEN COALESCE(ended_at,NOW()) ELSE ended_at END WHERE id=$1 AND org_id=$2 RETURNING *`, [call.id, req.user.orgId, provider.providerCallId, mappedStatus]);
        execution = { status: mappedStatus, provider: provider.provider, provider_call_id: provider.providerCallId, provider_status: provider.callStatus };
        if (mappedStatus === 'completed') execution.status = 'completed';
        if (updated.rows.length) call.status = updated.rows[0].status;
        call.provider_call_id = provider.providerCallId;
      } catch (providerError) {
        await db.query(`UPDATE calls SET status='failed',ended_at=NOW() WHERE id=$1 AND org_id=$2`, [call.id, req.user.orgId]);
        execution = { status: 'failed', provider: 'ringcentral', error_code: 'PROVIDER_CALL_FAILED' };
      }
    }

    await syncCampaignLeadStatus(call.id, execution.status);
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'call',$4,$5)`, [req.user.orgId, req.user.userId, execution.status === 'failed' ? 'call.failed' : 'call.queued', call.id, { lead_id: leadId, session_id: sessionId, provider: execution.provider }]);
    const latest = await db.query('SELECT * FROM calls WHERE id=$1 AND org_id=$2', [call.id, req.user.orgId]);
    res.status(201).json({ call: latest.rows[0], execution });
  } catch (error) { console.error(error); res.status(500).json({ error: { code: 'CALL_CREATE_FAILED', message: 'Failed to create call' } }); }
});

router.get('/calls/:id/provider-status', async (req, res) => {
  if (!canOperate(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Dialer access denied' } });
  try {
    const current = await db.query('SELECT * FROM calls WHERE id=$1 AND org_id=$2 AND user_id=$3', [req.params.id, req.user.orgId, req.user.userId]);
    if (!current.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Call not found' } });
    const call = current.rows[0];
    if (!call.provider_call_id) return res.status(409).json({ error: { code: 'NO_PROVIDER_CALL', message: 'Call has no provider call ID' } });
    const provider = await ringCentral.getRingOut(call.provider_call_id);
    if (!provider.configured) return res.status(503).json({ error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'RingCentral is not configured' } });
    const mappedStatus = mapProviderStatus(provider.callStatus);
    const updated = await db.query(`UPDATE calls SET status=$3,started_at=CASE WHEN $3 IN ('ringing','in_progress','completed') THEN COALESCE(started_at,NOW()) ELSE started_at END,ended_at=CASE WHEN $3 IN ('completed','failed') THEN COALESCE(ended_at,NOW()) ELSE ended_at END WHERE id=$1 AND org_id=$2 AND user_id=$4 RETURNING *`, [call.id, req.user.orgId, mappedStatus, req.user.userId]);
    await syncCampaignLeadStatus(call.id, mappedStatus);
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'call.provider_status_synced','call',$3,$4)`, [req.user.orgId, req.user.userId, call.id, { provider: 'ringcentral', provider_status: provider.callStatus, mapped_status: mappedStatus }]);
    res.json({ call: updated.rows[0], provider });
  } catch (error) { console.error(error); res.status(502).json({ error: { code: 'PROVIDER_STATUS_FAILED', message: 'Failed to synchronize provider call status' } }); }
});

router.patch('/calls/:id', async (req, res) => {
  if (!canOperate(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Dialer access denied' } });
  const status = req.body?.status == null ? null : String(req.body.status);
  const disposition = req.body?.disposition == null ? null : String(req.body.disposition).trim() || null;
  const duration = req.body?.duration_seconds == null ? null : Number(req.body.duration_seconds);
  if (status && !new Set(['queued','ringing','in_progress','completed','failed','cancelled']).has(status)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid call status' } });
  if (duration !== null && (!Number.isFinite(duration) || duration < 0)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid duration_seconds' } });
  if (!status && disposition === null && duration === null) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No call fields supplied' } });
  try {
    const result = await db.query(`UPDATE calls SET status=COALESCE($3,status),disposition=COALESCE($4,disposition),ended_at=CASE WHEN $3 IN ('completed','failed','cancelled') THEN COALESCE(ended_at,NOW()) ELSE ended_at END,duration_seconds=COALESCE($5,duration_seconds) WHERE id=$1 AND org_id=$2 AND user_id=$6 RETURNING *`, [req.params.id, req.user.orgId, status, disposition, duration, req.user.userId]);
    if (!result.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Call not found' } });
    if (status && terminalStatuses.has(status)) await syncCampaignLeadStatus(result.rows[0].id, status);
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'call.updated','call',$3,$4)`, [req.user.orgId, req.user.userId, result.rows[0].id, { status, disposition, duration_seconds: duration }]);
    res.json({ call: result.rows[0] });
  } catch (error) { console.error(error); res.status(500).json({ error: { code: 'CALL_UPDATE_FAILED', message: 'Failed to update call' } }); }
});

router.get('/stats', async (req, res) => {
  try {
    const result = await db.query(`SELECT COUNT(*)::int AS calls,COUNT(*) FILTER (WHERE status='completed')::int AS completed,COUNT(*) FILTER (WHERE status='in_progress')::int AS in_progress,COUNT(*) FILTER (WHERE disposition IS NOT NULL)::int AS dispositioned,COALESCE(SUM(duration_seconds),0)::int AS talk_time_seconds FROM calls WHERE org_id=$1 AND created_at >= COALESCE($2::timestamptz,CURRENT_DATE)`, [req.user.orgId, req.query.since || null]);
    res.json({ stats: result.rows[0] });
  } catch (error) { console.error(error); res.status(500).json({ error: { code: 'DIALER_STATS_FAILED', message: 'Failed to load dialer statistics' } }); }
});

module.exports = router;
