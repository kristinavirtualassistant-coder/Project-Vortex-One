const express=require('express');
const auth=require('../middleware/auth');
const db=require('../db');
const router=express.Router();
router.use(auth);
const writable=r=>['owner','admin','manager','rep'].includes(r);

async function validateReferences(orgId,b){
  const checks=[['assigned_user_id','users'],['lead_id','leads'],['property_id','properties'],['owner_id','owners']];
  for(const [field,table] of checks){
    if(b[field]===undefined||b[field]===null||b[field]==='')continue;
    const r=await db.query(`SELECT 1 FROM ${table} WHERE id=$1 AND org_id=$2 LIMIT 1`,[b[field],orgId]);
    if(!r.rows.length)return {field,table};
  }
  return null;
}

router.get('/',async(req,res)=>{const lim=Math.min(Math.max(Number(req.query.limit)||50,1),200);const r=await db.query('SELECT t.*,u.name assigned_user_name,o.name owner_name,p.address property_address FROM tasks t LEFT JOIN users u ON u.id=t.assigned_user_id AND u.org_id=t.org_id LEFT JOIN owners o ON o.id=t.owner_id AND o.org_id=t.org_id LEFT JOIN properties p ON p.id=t.property_id AND p.org_id=t.org_id WHERE t.org_id=$1 ORDER BY t.due_at NULLS LAST,t.created_at DESC LIMIT $2',[req.user.orgId,lim]);res.json({items:r.rows});});

router.post('/',async(req,res)=>{
  if(!writable(req.user.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Task creation denied'}});
  const b=req.body||{},title=String(b.title||'').trim();
  if(!title)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Task title is required'}});
  const invalid=await validateReferences(req.user.orgId,b);
  if(invalid)return res.status(400).json({error:{code:'CROSS_ORGANIZATION_REFERENCE',message:`${invalid.field} does not belong to the current organization`}});
  const r=await db.query('INSERT INTO tasks(org_id,assigned_user_id,lead_id,property_id,owner_id,title,description,status,priority,due_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[req.user.orgId,b.assigned_user_id||null,b.lead_id||null,b.property_id||null,b.owner_id||null,title,b.description||null,b.status||'open',b.priority||'normal',b.due_at||null,req.user.userId]);
  await db.query('INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)',[req.user.orgId,req.user.userId,'task.created','task',r.rows[0].id,{title}]);
  res.status(201).json({task:r.rows[0]});
});

router.patch('/:id',async(req,res)=>{
  if(!writable(req.user.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Task update denied'}});
  const b=req.body||{};
  const invalid=await validateReferences(req.user.orgId,b);
  if(invalid)return res.status(400).json({error:{code:'CROSS_ORGANIZATION_REFERENCE',message:`${invalid.field} does not belong to the current organization`}});
  const keys=['title','description','assigned_user_id','lead_id','property_id','owner_id','status','priority','due_at'],f=[],v=[req.user.orgId,req.params.id];
  for(const k of keys)if(k in b){f.push(k+'=$'+(v.length+1));v.push(b[k]??null);}
  if(!f.length)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'No fields supplied'}});
  if(b.status==='completed')f.push('completed_at=COALESCE(completed_at,NOW())');else if(b.status)f.push('completed_at=NULL');
  f.push('updated_at=NOW()');
  const r=await db.query('UPDATE tasks SET '+f.join(',')+' WHERE org_id=$1 AND id=$2 RETURNING *',v);
  if(!r.rows.length)return res.status(404).json({error:{code:'NOT_FOUND',message:'Task not found'}});
  await db.query('INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)',[req.user.orgId,req.user.userId,'task.updated','task',r.rows[0].id,{fields:Object.keys(b)}]);
  res.json({task:r.rows[0]});
});
module.exports=router;
