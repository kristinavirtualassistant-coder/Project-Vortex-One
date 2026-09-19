const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();

function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function validPassword(password) { return typeof password === 'string' && password.length >= 8; }

router.post('/register', async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { organization, name, email, password } = req.body || {};
    const normalized = normalizeEmail(email);
    if (!String(organization || '').trim() || !String(name || '').trim() || !normalized || !validPassword(password)) return res.status(400).json({ error: { code:'VALIDATION_ERROR', message:'Organization, name, email and an 8+ character password are required' } });
    await client.query('BEGIN');
    const exists = await client.query('SELECT id FROM users WHERE email=$1', [normalized]);
    if (exists.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: { code:'EMAIL_EXISTS', message:'Email already registered' } }); }
    const org = await client.query('INSERT INTO organizations(name) VALUES($1) RETURNING id', [String(organization).trim()]);
    const hash = await bcrypt.hash(password, 12);
    const user = await client.query('INSERT INTO users(org_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,org_id,name,email,role', [org.rows[0].id, String(name).trim(), normalized, hash, 'owner']);
    await client.query('INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)', [org.rows[0].id, user.rows[0].id, 'owner']);
    await client.query('INSERT INTO system_settings(organization_id) VALUES($1) ON CONFLICT (organization_id) DO NOTHING', [org.rows[0].id]);
    await client.query('INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)', [org.rows[0].id,user.rows[0].id,'organization.created','organization',org.rows[0].id,{}]);
    await client.query('COMMIT');
    const token = jwt.sign({ userId:user.rows[0].id, orgId:user.rows[0].org_id, name:user.rows[0].name, role:user.rows[0].role }, process.env.JWT_SECRET, { expiresIn:'12h' });
    res.status(201).json({ token, user:user.rows[0] });
  } catch (e) { await client.query('ROLLBACK').catch(()=>{}); console.error(e); res.status(500).json({ error: { code:'REGISTRATION_FAILED', message:'Registration failed' } }); }
  finally { client.release(); }
});

router.post('/login', async (req, res) => {
  try {
    const normalized = normalizeEmail(req.body?.email);
    const result = await db.query('SELECT id,org_id,name,email,role,password_hash FROM users WHERE email=$1', [normalized]);
    if (!result.rows.length || !(await bcrypt.compare(req.body?.password || '', result.rows[0].password_hash))) return res.status(401).json({ error: { code:'INVALID_CREDENTIALS', message:'Invalid email or password' } });
    const u = result.rows[0];
    const membership = await db.query('SELECT status,role FROM organization_members WHERE organization_id=$1 AND user_id=$2', [u.org_id,u.id]);
    if (!membership.rows.length || membership.rows[0].status !== 'active') return res.status(403).json({ error: { code:'MEMBERSHIP_REQUIRED', message:'This account is not an active organization member' } });
    u.role = membership.rows[0].role;
    const token = jwt.sign({ userId:u.id, orgId:u.org_id, name:u.name, role:u.role }, process.env.JWT_SECRET, { expiresIn:'12h' });
    delete u.password_hash;
    res.json({ token, user:u });
  } catch (e) { console.error(e); res.status(500).json({ error: { code:'LOGIN_FAILED', message:'Login failed' } }); }
});
module.exports = router;
