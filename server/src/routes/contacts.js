const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db');
const router = express.Router();
router.use(auth);

const writable = role => ['owner','admin','manager','rep'].includes(role);

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const q = String(req.query.q || '').trim();
    const params = [req.user.orgId];
    let where = 'c.org_id=$1';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (c.display_name ILIKE $2 OR c.first_name ILIKE $2 OR c.last_name ILIKE $2 OR c.title ILIKE $2 OR c.mailing_address ILIKE $2 OR EXISTS (SELECT 1 FROM contact_phones cp WHERE cp.contact_id=c.id AND cp.phone ILIKE $2) OR EXISTS (SELECT 1 FROM contact_emails ce WHERE ce.contact_id=c.id AND ce.email ILIKE $2))`;
    }
    params.push(limit);
    const result = await db.query(`SELECT c.id,c.owner_id,c.first_name,c.last_name,c.display_name,c.title,c.mailing_address,c.created_at,c.updated_at,o.name owner_name,COALESCE((SELECT json_agg(json_build_object('id',cp.id,'phone',cp.phone,'type',cp.phone_type,'primary',cp.is_primary,'verified_at',cp.verified_at) ORDER BY cp.is_primary DESC,cp.phone) FROM contact_phones cp WHERE cp.contact_id=c.id),'[]') phones,COALESCE((SELECT json_agg(json_build_object('id',ce.id,'email',ce.email,'type',ce.email_type,'primary',ce.is_primary,'verified_at',ce.verified_at) ORDER BY ce.is_primary DESC,ce.email) FROM contact_emails ce WHERE ce.contact_id=c.id),'[]') emails FROM contacts c LEFT JOIN owners o ON o.id=c.owner_id AND o.org_id=c.org_id WHERE ${where} ORDER BY COALESCE(c.display_name,c.last_name,c.first_name) LIMIT $${params.length}`, params);
    res.json({ items: result.rows });
  } catch (error) { console.error(error); res.status(500).json({ error: { code: 'CONTACT_SEARCH_FAILED', message: 'Unable to load contacts' } }); }
});

router.get('/:id', async (req, res) => {
  try {
    const contact = await db.query('SELECT c.*,o.name owner_name FROM contacts c LEFT JOIN owners o ON o.id=c.owner_id AND o.org_id=c.org_id WHERE c.id=$1 AND c.org_id=$2', [req.params.id, req.user.orgId]);
    if (!contact.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Contact not found' } });
    const phones = await db.query('SELECT id,phone,phone_type,is_primary,verified_at,created_at FROM contact_phones WHERE contact_id=$1 ORDER BY is_primary DESC,phone', [req.params.id]);
    const emails = await db.query('SELECT id,email,email_type,is_primary,verified_at,created_at FROM contact_emails WHERE contact_id=$1 ORDER BY is_primary DESC,email', [req.params.id]);
    res.json({ contact: contact.rows[0], phones: phones.rows, emails: emails.rows });
  } catch (error) { console.error(error); res.status(500).json({ error: { code: 'CONTACT_READ_FAILED', message: 'Unable to load contact' } }); }
});

router.post('/', async (req, res) => {
  if (!writable(req.user.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Contact creation denied' } });
  const b = req.body || {};
  const displayName = String(b.display_name || [b.first_name, b.last_name].filter(Boolean).join(' ') || '').trim();
  if (!displayName) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A contact name is required' } });
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    if (b.owner_id) {
      const owner = await client.query('SELECT id FROM owners WHERE id=$1 AND org_id=$2', [b.owner_id, req.user.orgId]);
      if (!owner.rows.length) {
        const validationError = new Error('Owner is not in this organization');
        validationError.status = 400; validationError.code = 'OWNER_NOT_FOUND';
        throw validationError;
      }
    }
    const contact = await client.query('INSERT INTO contacts(org_id,owner_id,first_name,last_name,display_name,title,mailing_address) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [req.user.orgId,b.owner_id||null,b.first_name||null,b.last_name||null,displayName,b.title||null,b.mailing_address||null]);
    if (b.phone) await client.query('INSERT INTO contact_phones(contact_id,phone,phone_type,is_primary) VALUES($1,$2,$3,$4)', [contact.rows[0].id,String(b.phone).trim(),b.phone_type||'primary',true]);
    if (b.email) await client.query('INSERT INTO contact_emails(contact_id,email,email_type,is_primary) VALUES($1,$2,$3,$4)', [contact.rows[0].id,String(b.email).trim().toLowerCase(),b.email_type||'primary',true]);
    await client.query('INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)', [req.user.orgId,req.user.userId,'contact.created','contact',contact.rows[0].id,{source:'manual'}]);
    await client.query('COMMIT');
    res.status(201).json({ contact: contact.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.status) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    console.error(error); res.status(500).json({ error: { code: 'CONTACT_CREATE_FAILED', message: 'Unable to create contact' } });
  } finally { client.release(); }
});

module.exports = router;
