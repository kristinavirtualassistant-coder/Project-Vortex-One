const express=require('express');
const db=require('../db');
const auth=require('../middleware/auth');
const router=express.Router();
router.use(auth);
const writable=new Set(['owner','admin','manager']);
const statuses=new Set(['review','accepted','rejected']);

router.get('/',async(req,res)=>{
  try{
    const limit=Math.min(Math.max(Number(req.query.limit)||50,1),200);
    const status=String(req.query.status||'review');
    if(!statuses.has(status)) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Invalid duplicate status'}});
    const result=await db.query(`SELECT d.id,d.entity_type,d.entity_id,d.candidate_entity_id,d.match_key,d.confidence,d.status,d.created_at,
      CASE WHEN d.entity_type='owner' THEN o1.name WHEN d.entity_type='property' THEN p1.address ELSE NULL END entity_name,
      CASE WHEN d.entity_type='owner' THEN o2.name WHEN d.entity_type='property' THEN p2.address ELSE NULL END candidate_name
      FROM duplicate_candidates d
      LEFT JOIN owners o1 ON d.entity_type='owner' AND o1.id=d.entity_id AND o1.org_id=d.org_id
      LEFT JOIN owners o2 ON d.entity_type='owner' AND o2.id=d.candidate_entity_id AND o2.org_id=d.org_id
      LEFT JOIN properties p1 ON d.entity_type='property' AND p1.id=d.entity_id AND p1.org_id=d.org_id
      LEFT JOIN properties p2 ON d.entity_type='property' AND p2.id=d.candidate_entity_id AND p2.org_id=d.org_id
      WHERE d.org_id=$1 AND d.status=$2 ORDER BY d.created_at DESC LIMIT $3`,[req.user.orgId,status,limit]);
    res.json({items:result.rows});
  }catch(e){console.error(e);res.status(500).json({error:{code:'DUPLICATES_LOAD_FAILED',message:'Unable to load duplicate candidates'}});}
});

router.patch('/:id',async(req,res)=>{
  if(!writable.has(req.user.role)) return res.status(403).json({error:{code:'FORBIDDEN',message:'Duplicate review denied'}});
  const status=String(req.body?.status||'');
  if(!statuses.has(status)||status==='review') return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Status must be accepted or rejected'}});
  try{
    const result=await db.query(`UPDATE duplicate_candidates SET status=$1 WHERE id=$2 AND org_id=$3 RETURNING *`,[status,req.params.id,req.user.orgId]);
    if(!result.rows.length)return res.status(404).json({error:{code:'NOT_FOUND',message:'Duplicate candidate not found'}});
    const candidate=result.rows[0];
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'duplicate_candidate',$4,$5)`,[req.user.orgId,req.user.userId,`duplicate.${status}`,candidate.id,{entityType:candidate.entity_type,entityId:candidate.entity_id,candidateEntityId:candidate.candidate_entity_id}]);
    res.json({candidate});
  }catch(e){console.error(e);res.status(500).json({error:{code:'DUPLICATE_UPDATE_FAILED',message:'Unable to update duplicate candidate'}});}
});
module.exports=router;
