const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();
router.use(auth);

const writable = role => ['owner','admin','manager','rep'].includes(role);
const statuses = new Set(['new','contacted','qualified','interested','callback_requested','not_interested','wrong_number','no_answer','voicemail','converted','closed']);

async function validateReference(table, id, orgId) {
  if (id == null || id === '') return true;
  const result = await db.query(`SELECT 1 FROM ${table} WHERE id=$1 AND org_id=$2 LIMIT 1`, [id, orgId]);
  return result.rows.length > 0;
}

router.get('/', async (req,res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();
    const params = [req.user.orgId];
    const where = ['l.org_id=$1'];
    if (q) { params.push(`%${q}%`); where.push(`(o.name ILIKE $${params.length} OR p.address ILIKE $${params.length} OR l.phone ILIKE $${params.length} OR l.source ILIKE $${params.length})`); }
    if (status) { if (!statuses.has(status)) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Invalid lead status'}}); params.push(status); where.push(`l.status=$${params.length}`); }
    params.push(limit);
    const result = await db.query(`SELECT l.id,l.status,l.lead_score,l.phone,l.source,l.assigned_user_id,l.next_followup_date,l.next_followup_time,l.created_at,l.updated_at,o.id AS owner_id,o.name AS owner_name,o.phone AS callback_number,p.id AS property_id,p.address AS property_address,u.name AS assigned_user_name FROM leads l LEFT JOIN owners o ON o.id=l.owner_id AND o.org_id=l.org_id LEFT JOIN properties p ON p.id=l.property_id AND p.org_id=l.org_id LEFT JOIN users u ON u.id=l.assigned_user_id AND u.org_id=l.org_id WHERE ${where.join(' AND ')} ORDER BY l.updated_at DESC LIMIT $${params.length}`, params);
    res.json(result.rows);
  } catch(e) { console.error(e); res.status(500).json({error:{code:'LEAD_SEARCH_FAILED',message:'Failed to load leads'}}); }
});

router.get('/:id', async (req,res) => {
  try {
    const lead = await db.query(`SELECT l.*,o.name owner_name,p.address property_address,u.name assigned_user_name FROM leads l LEFT JOIN owners o ON o.id=l.owner_id AND o.org_id=l.org_id LEFT JOIN properties p ON p.id=l.property_id AND p.org_id=l.org_id LEFT JOIN users u ON u.id=l.assigned_user_id AND u.org_id=l.org_id WHERE l.id=$1 AND l.org_id=$2`, [req.params.id, req.user.orgId]);
    if (!lead.rows.length) return res.status(404).json({error:{code:'NOT_FOUND',message:'Lead not found'}});
    const notes = await db.query(`SELECT n.id,n.body,n.created_at,u.name author_name FROM lead_notes n LEFT JOIN users u ON u.id=n.author_user_id AND u.org_id=n.org_id WHERE n.lead_id=$1 AND n.org_id=$2 ORDER BY n.created_at DESC`, [req.params.id, req.user.orgId]);
    const activities = await db.query(`SELECT a.id,a.activity_type,a.subject,a.body,a.metadata,a.created_at,u.name actor_name FROM activities a LEFT JOIN users u ON u.id=a.actor_user_id AND u.org_id=a.org_id WHERE a.entity_type='lead' AND a.entity_id=$1 AND a.org_id=$2 ORDER BY a.created_at DESC LIMIT 100`, [req.params.id, req.user.orgId]);
    res.json({lead:lead.rows[0],notes:notes.rows,activities:activities.rows});
  } catch(e) { console.error(e); res.status(500).json({error:{code:'LEAD_READ_FAILED',message:'Failed to load lead'}}); }
});

router.post('/', async (req,res) => {
  if (!writable(req.user.role)) return res.status(403).json({error:{code:'FORBIDDEN',message:'Lead creation denied'}});
  const b = req.body || {}, status = String(b.status || 'new');
  if (!statuses.has(status)) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Invalid lead status'}});
  if (!(await validateReference('owners',b.owner_id,req.user.orgId))) return res.status(400).json({error:{code:'CROSS_ORGANIZATION_REFERENCE',message:'owner_id does not belong to the current organization'}});
  if (!(await validateReference('properties',b.property_id,req.user.orgId))) return res.status(400).json({error:{code:'CROSS_ORGANIZATION_REFERENCE',message:'property_id does not belong to the current organization'}});
  if (!(await validateReference('users',b.assigned_user_id,req.user.orgId))) return res.status(400).json({error:{code:'CROSS_ORGANIZATION_REFERENCE',message:'assigned_user_id does not belong to the current organization'}});
  if (!b.phone && !b.owner_id && !b.property_id) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Lead requires a phone, owner, or property reference'}});
  try {
    const result = await db.query(`INSERT INTO leads(org_id,owner_id,property_id,phone,status,lead_score,source,assigned_user_id,next_followup_date,next_followup_time) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [req.user.orgId,b.owner_id||null,b.property_id||null,b.phone?String(b.phone).trim():null,status,b.lead_score==null?0:Number(b.lead_score),b.source?String(b.source).trim():null,b.assigned_user_id||null,b.next_followup_date||null,b.next_followup_time||null]);
    const lead=result.rows[0];
    await db.query(`INSERT INTO activities(org_id,actor_user_id,entity_type,entity_id,activity_type,subject,metadata) VALUES($1,$2,'lead',$3,'created','Lead created',$4)`,[req.user.orgId,req.user.userId,lead.id,{source:lead.source}]);
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'lead.created','lead',$3,$4)`,[req.user.orgId,req.user.userId,lead.id,{source:lead.source}]);
    res.status(201).json({lead});
  } catch(e) { console.error(e); res.status(500).json({error:{code:'LEAD_CREATE_FAILED',message:'Failed to create lead'}}); }
});

router.patch('/:id', async (req,res) => {
  if (!writable(req.user.role)) return res.status(403).json({error:{code:'FORBIDDEN',message:'Lead update denied'}});
  const b=req.body||{};
  if (b.status!=null && !statuses.has(String(b.status))) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Invalid lead status'}});
  for (const [field,table] of [['owner_id','owners'],['property_id','properties'],['assigned_user_id','users']]) if (b[field]!==undefined && b[field]!==null && !(await validateReference(table,b[field],req.user.orgId))) return res.status(400).json({error:{code:'CROSS_ORGANIZATION_REFERENCE',message:`${field} does not belong to the current organization`}});
  const allowed=['owner_id','property_id','phone','status','lead_score','source','assigned_user_id','next_followup_date','next_followup_time'];
  const fields=[],values=[req.user.orgId,req.params.id];
  for(const key of allowed) if(key in b){fields.push(`${key}=$${values.length+1}`);values.push(b[key]===''?null:b[key]);}
  if(!fields.length)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'No lead fields supplied'}});
  fields.push('updated_at=NOW()');
  try {
    const result=await db.query(`UPDATE leads SET ${fields.join(',')} WHERE org_id=$1 AND id=$2 RETURNING *`,values);
    if(!result.rows.length)return res.status(404).json({error:{code:'NOT_FOUND',message:'Lead not found'}});
    const changed=Object.keys(b).filter(k=>allowed.includes(k));
    await db.query(`INSERT INTO activities(org_id,actor_user_id,entity_type,entity_id,activity_type,subject,metadata) VALUES($1,$2,'lead',$3,'updated','Lead updated',$4)`,[req.user.orgId,req.user.userId,result.rows[0].id,{fields:changed}]);
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'lead.updated','lead',$3,$4)`,[req.user.orgId,req.user.userId,result.rows[0].id,{fields:changed}]);
    res.json({lead:result.rows[0]});
  } catch(e) { console.error(e); res.status(500).json({error:{code:'LEAD_UPDATE_FAILED',message:'Failed to update lead'}}); }
});

router.post('/:id/notes', async (req,res) => {
  if (!writable(req.user.role)) return res.status(403).json({error:{code:'FORBIDDEN',message:'Lead notes denied'}});
  const body=String(req.body?.body||'').trim(); if(!body)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Note body is required'}});
  try {
    const lead=await db.query('SELECT id FROM leads WHERE id=$1 AND org_id=$2',[req.params.id,req.user.orgId]); if(!lead.rows.length)return res.status(404).json({error:{code:'NOT_FOUND',message:'Lead not found'}});
    const note=await db.query(`INSERT INTO lead_notes(org_id,lead_id,author_user_id,body) VALUES($1,$2,$3,$4) RETURNING *`,[req.user.orgId,req.params.id,req.user.userId,body]);
    await db.query(`INSERT INTO activities(org_id,actor_user_id,entity_type,entity_id,activity_type,subject,body) VALUES($1,$2,'lead',$3,'note','Lead note',$4)`,[req.user.orgId,req.user.userId,req.params.id,body]);
    res.status(201).json({note:note.rows[0]});
  } catch(e) { console.error(e); res.status(500).json({error:{code:'LEAD_NOTE_FAILED',message:'Failed to create lead note'}}); }
});

module.exports=router;
