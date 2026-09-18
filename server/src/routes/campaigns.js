const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');

const router = express.Router();
router.use(auth);

const canWrite = role => ['owner', 'admin', 'manager'].includes(role);

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const result = await db.query(`
      SELECT c.id, c.name, c.description, c.status, c.created_at, c.updated_at,
             COUNT(cl.lead_id)::int AS lead_count,
             COUNT(cl.lead_id) FILTER (WHERE cl.status='queued')::int AS queued_count,
             COUNT(cl.lead_id) FILTER (WHERE cl.status='completed')::int AS completed_count
      FROM campaigns c
      LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
      WHERE c.org_id = $1
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.created_at DESC
      LIMIT $2`, [req.user.orgId, limit]);
    res.json({ items: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'CAMPAIGNS_LOAD_FAILED', message: 'Failed to load campaigns' } });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const campaign = await db.query(`SELECT id,name,description,status,created_at,updated_at FROM campaigns WHERE org_id=$1 AND id=$2`, [req.user.orgId, req.params.id]);
    if (!campaign.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
    const leads = await db.query(`
      SELECT cl.campaign_id, cl.lead_id, cl.status, cl.position, cl.added_at,
             l.status AS lead_status, l.lead_score, l.phone,
             o.name AS owner_name, p.address AS property_address
      FROM campaign_leads cl
      JOIN leads l ON l.id=cl.lead_id AND l.org_id=$1
      LEFT JOIN owners o ON o.id=l.owner_id AND o.org_id=$1
      LEFT JOIN properties p ON p.id=l.property_id AND p.org_id=$1
      WHERE cl.campaign_id=$2
      ORDER BY cl.position NULLS LAST, cl.added_at`, [req.user.orgId, req.params.id]);
    res.json({ campaign: campaign.rows[0], leads: leads.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'CAMPAIGN_LOAD_FAILED', message: 'Failed to load campaign' } });
  }
});

router.post('/', async (req, res) => {
  if (!canWrite(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Campaign creation denied' } });
  const name = String(req.body?.name || '').trim();
  const description = req.body?.description == null ? null : String(req.body.description).trim() || null;
  if (!name) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Campaign name is required' } });
  try {
    const result = await db.query(`INSERT INTO campaigns(org_id,name,description,status) VALUES($1,$2,$3,$4) RETURNING *`, [req.user.orgId, name, description, 'draft']);
    const campaign = result.rows[0];
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)`, [req.user.orgId, req.user.userId, 'campaign.created', 'campaign', campaign.id, { name }]);
    res.status(201).json({ campaign });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'CAMPAIGN_CREATE_FAILED', message: 'Failed to create campaign' } });
  }
});

router.patch('/:id', async (req, res) => {
  if (!canWrite(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Campaign update denied' } });
  const allowed = ['name', 'description', 'status'];
  const values = [req.user.orgId, req.params.id];
  const fields = [];
  for (const key of allowed) {
    if (!(key in (req.body || {}))) continue;
    const value = req.body[key] == null ? null : String(req.body[key]).trim();
    if (key === 'name' && !value) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Campaign name cannot be empty' } });
    fields.push(`${key}=$${values.length + 1}`);
    values.push(value);
  }
  if (!fields.length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No fields supplied' } });
  fields.push('updated_at=NOW()');
  try {
    const result = await db.query(`UPDATE campaigns SET ${fields.join(',')} WHERE org_id=$1 AND id=$2 RETURNING *`, values);
    if (!result.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)`, [req.user.orgId, req.user.userId, 'campaign.updated', 'campaign', req.params.id, { fields: Object.keys(req.body || {}).filter(k => allowed.includes(k)) }]);
    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: 'CAMPAIGN_UPDATE_FAILED', message: 'Failed to update campaign' } });
  }
});

router.post('/:id/leads', async (req, res) => {
  if (!canWrite(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Campaign lead assignment denied' } });
  const leadIds = Array.isArray(req.body?.lead_ids) ? [...new Set(req.body.lead_ids.map(String).filter(Boolean))] : [];
  if (!leadIds.length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'lead_ids must contain at least one lead id' } });
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const valid = await client.query(`SELECT id FROM leads WHERE org_id=$1 AND id = ANY($2::uuid[])`, [req.user.orgId, leadIds]);
    const validIds = valid.rows.map(r => r.id);
    if (!validIds.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No organization-scoped leads matched' } }); }
    for (let i = 0; i < validIds.length; i++) {
      await client.query(`INSERT INTO campaign_leads(campaign_id,lead_id,status,position) SELECT $1,$2,'queued',$3 WHERE EXISTS (SELECT 1 FROM campaigns WHERE id=$1 AND org_id=$4) ON CONFLICT (campaign_id,lead_id) DO NOTHING`, [req.params.id, validIds[i], i, req.user.orgId]);
    }
    await client.query(`UPDATE campaigns SET updated_at=NOW() WHERE id=$1 AND org_id=$2`, [req.params.id, req.user.orgId]);
    await client.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)`, [req.user.orgId, req.user.userId, 'campaign.leads_added', 'campaign', req.params.id, { requested: leadIds.length, matched: validIds.length }]);
    await client.query('COMMIT');
    res.status(201).json({ added: validIds.length, skipped: leadIds.length - validIds.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: { code: 'CAMPAIGN_LEADS_FAILED', message: 'Failed to add campaign leads' } });
  } finally { client.release(); }
});

module.exports = router;
