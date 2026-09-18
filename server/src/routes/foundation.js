const express = require('express');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const db = require('../db');

const router = express.Router();
router.use(auth);

const ROLE_PERMISSIONS = {
  owner: ['admin.members','admin.settings','dashboard.read'],
  admin: ['admin.members','admin.settings','dashboard.read'],
  manager: ['dashboard.read'],
  rep: ['dashboard.read'],
  viewer: ['dashboard.read']
};

async function membership(req) {
  const { rows } = await db.query(`SELECT organization_id,user_id,role,status FROM organization_members WHERE organization_id=$1 AND user_id=$2 AND status='active'`, [req.user.orgId,req.user.userId]);
  return rows[0] || null;
}
function allowed(role, permission) { return (ROLE_PERMISSIONS[role] || []).includes(permission); }

router.get('/dashboard', async (req,res) => {
  const m=await membership(req); if(!m||!allowed(m.role,'dashboard.read')) return res.status(403).json({error:{code:'FORBIDDEN',message:'Dashboard access denied'}});
  const {rows}=await db.query(`SELECT (SELECT COUNT(*) FROM properties WHERE org_id=$1) properties,(SELECT COUNT(*) FROM owners WHERE org_id=$1) owners,(SELECT COUNT(*) FROM leads WHERE org_id=$1) leads,(SELECT COUNT(*) FROM calls WHERE org_id=$1) calls,(SELECT COUNT(*) FROM organization_members WHERE organization_id=$1 AND status='active') members`,[req.user.orgId]);
  res.json({counts:Object.fromEntries(Object.entries(rows[0]).map(([k,v])=>[k,Number(v)]))});
});

router.get('/members', async (req,res) => {
  const m=await membership(req); if(!m||!allowed(m.role,'admin.members')) return res.status(403).json({error:{code:'FORBIDDEN',message:'Member administration denied'}});
  const {rows}=await db.query(`SELECT m.id,u.name,u.email,m.role,m.status,m.created_at FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.name,u.email`,[req.user.orgId]);
  res.json({items:rows});
});

router.post('/members', async (req,res) => {
  const m=await membership(req); if(!m||!allowed(m.role,'admin.members')) return res.status(403).json({error:{code:'FORBIDDEN',message:'Member administration denied'}});
  const {name,email,password,role='rep'}=req.body||{};
  if(!name||!email||!password||password.length<8||!['admin','manager','rep','viewer'].includes(role)) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Name, email, 8+ character password, and valid role are required'}});
  const client=await db.pool.connect();
  try {
    await client.query('BEGIN');
    const normalized=email.toLowerCase().trim();
    const exists=await client.query('SELECT id FROM users WHERE email=$1',[normalized]);
    if(exists.rows.length){await client.query('ROLLBACK');return res.status(409).json({error:{code:'EMAIL_EXISTS',message:'Email already exists'}});}
    const hash=await bcrypt.hash(password,12);
    const user=await client.query('INSERT INTO users(org_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role',[req.user.orgId,name.trim(),normalized,hash,role]);
    const member=await client.query('INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id,role,status',[req.user.orgId,user.rows[0].id,role]);
    await client.query('INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)',[req.user.orgId,req.user.userId,'member.created','user',user.rows[0].id,{role}]);
    await client.query('COMMIT'); res.status(201).json({item:{...user.rows[0],...member.rows[0]}});
  } catch(err){await client.query('ROLLBACK');console.error(err);res.status(500).json({error:{code:'MEMBER_CREATE_FAILED',message:'Unable to create member'}});} finally{client.release();}
});

router.get('/settings', async (req,res) => {
  const m=await membership(req); if(!m||!allowed(m.role,'admin.settings')) return res.status(403).json({error:{code:'FORBIDDEN',message:'Settings administration denied'}});
  const {rows}=await db.query('SELECT settings,updated_at FROM system_settings WHERE organization_id=$1',[req.user.orgId]); res.json({settings:rows[0]?.settings||{},updatedAt:rows[0]?.updated_at||null});
});

router.get('/audit', async (req,res) => {
  const m=await membership(req); if(!m||!allowed(m.role,'admin.settings')) return res.status(403).json({error:{code:'FORBIDDEN',message:'Audit access denied'}});
  const {rows}=await db.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.details,a.created_at,u.name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.organization_id=$1 ORDER BY a.created_at DESC LIMIT 100`,[req.user.orgId]); res.json({items:rows});
});
module.exports=router;
