const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { organization, name, email, password } = req.body;
    if (!organization || !name || !email || !password || password.length < 8) return res.status(400).json({ error: 'Organization, name, email and an 8+ character password are required' });
    const exists = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });
    const org = await db.query('INSERT INTO organizations(name) VALUES($1) RETURNING id', [organization]);
    const hash = await bcrypt.hash(password, 12);
    const user = await db.query('INSERT INTO users(org_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,org_id,name,email,role', [org.rows[0].id, name, email.toLowerCase(), hash, 'admin']);
    const token = jwt.sign({ userId: user.rows[0].id, orgId: user.rows[0].org_id, name: user.rows[0].name, role: user.rows[0].role }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.status(201).json({ token, user: user.rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Registration failed' }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await db.query('SELECT id,org_id,name,email,role,password_hash FROM users WHERE email=$1', [(email || '').toLowerCase()]);
    if (!result.rows.length || !(await bcrypt.compare(password || '', result.rows[0].password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
    const u = result.rows[0];
    const token = jwt.sign({ userId: u.id, orgId: u.org_id, name: u.name, role: u.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
    delete u.password_hash;
    res.json({ token, user: u });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Login failed' }); }
});
module.exports = router;
