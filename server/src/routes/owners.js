const express=require('express');const db=require('../db');const auth=require('../middleware/auth');const router=express.Router();router.use(auth);
const writable=role=>['owner','admin','manager','rep'].includes(role);
const {enrichOwner,startFullEnrich,getFullEnrichResult,reconcileFullEnrich}=require('../services/ownerEnrichment');
router.get('/',async(req,res)=>{try{const q=String(req.query.q||'').trim(),limit=Math.min(Math.max(Number(req.query.limit)||50,1),200),params=[req.user.orgId];let sql=`SELECT o.id,o.name,o.phone,o.email,o.mailing_address,COUNT(DISTINCT po.property_id)::int property_count,COUNT(DISTINCT l.id)::int lead_count FROM owners o LEFT JOIN property_owners po ON po.owner_id=o.id LEFT JOIN properties p ON p.id=po.property_id AND p.org_id=o.org_id LEFT JOIN leads l ON l.owner_id=o.id AND l.org_id=o.org_id WHERE o.org_id=$1`;if(q){params.push(`%${q}%`);sql+=` AND (o.name ILIKE $2 OR o.phone ILIKE $2 OR o.email ILIKE $2 OR o.mailing_address ILIKE $2)`;}params.push(limit);sql+=` GROUP BY o.id ORDER BY o.name ASC LIMIT $${params.length}`;const result=await db.query(sql,params);res.json({ok:true,count:result.rows.length,owners:result.rows});}catch(e){console.error(e);res.status(500).json({error:{code:'OWNER_SEARCH_FAILED',message:'Failed to load owners'}});}});
router.get('/match',async(req,res)=>{try{const apn=String(req.query.apn||'').trim(),address=String(req.query.address||'').trim();if(!apn&&!address)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'apn or address is required'}});const params=[req.user.orgId,apn||address],where=apn?'p.apn=$2 OR p.ain=$2':'LOWER(TRIM(p.address))=LOWER(TRIM($2))';const result=await db.query(`SELECT o.id,o.name,o.phone,o.email,o.mailing_address,p.id property_id,p.address,p.apn,p.ain FROM property_owners po JOIN properties p ON p.id=po.property_id AND p.org_id=$1 JOIN owners o ON o.id=po.owner_id AND o.org_id=$1 WHERE p.org_id=$1 AND (${where}) ORDER BY o.name`,params);res.json({ok:true,count:result.rows.length,matched:result.rows.length>0,enrichment_status:result.rows.length?'matched_existing_org_record':'no_verified_owner_record',owners:result.rows});}catch(e){res.status(500).json({error:{code:'OWNER_MATCH_FAILED',message:'Owner match failed'}});}});
router.get('/:id/enrich/provider/:jobId',async(req,res)=>{
  try{
    const owner=(await db.query('SELECT id FROM owners WHERE id=$1 AND org_id=$2',[req.params.id,req.user.orgId])).rows[0];
    if(!owner)return res.status(404).json({error:{code:'NOT_FOUND',message:'Owner not found'}});
    const run=(await db.query("SELECT id,status FROM owner_enrichment_runs WHERE org_id=$1 AND owner_id=$2 AND provider_job_id=$3 ORDER BY requested_at DESC LIMIT 1",[req.user.orgId,owner.id,req.params.jobId])).rows[0];
    if(!run)return res.status(404).json({error:{code:'ENRICHMENT_JOB_NOT_FOUND',message:'Enrichment job not found'}});
    const result=await getFullEnrichResult(req.params.jobId);
    res.json({ok:true,provider:'fullenrich',runId:run.id,result});
  }catch(e){console.error(e);res.status(502).json({error:{code:'OWNER_PROVIDER_RESULT_FAILED',message:e.message}});}
});

router.post('/:id/enrich/provider/:jobId/reconcile',async(req,res)=>{
  if(!writable(req.user.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Owner enrichment denied'}});
  try{
    const owner=(await db.query('SELECT id FROM owners WHERE id=$1 AND org_id=$2',[req.params.id,req.user.orgId])).rows[0];
    if(!owner)return res.status(404).json({error:{code:'NOT_FOUND',message:'Owner not found'}});
    const run=(await db.query("SELECT id,provider_job_id,status FROM owner_enrichment_runs WHERE org_id=$1 AND owner_id=$2 AND provider_job_id=$3 ORDER BY requested_at DESC LIMIT 1",[req.user.orgId,owner.id,req.params.jobId])).rows[0];
    if(!run)return res.status(404).json({error:{code:'ENRICHMENT_JOB_NOT_FOUND',message:'Enrichment job not found'}});
    const providerResult=await getFullEnrichResult(req.params.jobId);
    const status=String(providerResult?.status||providerResult?.data?.status||providerResult?.result?.status||'').toLowerCase();
    if(status && !['completed','complete','finished','success','succeeded'].includes(status)){
      return res.status(202).json({ok:true,provider:'fullenrich',runId:run.id,status:status||'pending',reconciled:false,result:providerResult});
    }
    const result=await reconcileFullEnrich({orgId:req.user.orgId,ownerId:owner.id,runId:run.id,payload:providerResult,sourceKey:req.params.jobId});
    res.json({ok:true,provider:'fullenrich',...result});
  }catch(e){console.error(e);res.status(502).json({error:{code:'OWNER_PROVIDER_RECONCILE_FAILED',message:'Unable to reconcile provider result'}});}
});

router.post('/:id/enrich/provider',async(req,res)=>{
  if(!writable(req.user.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Owner enrichment denied'}});
  const b=req.body||{};
  try{
    const owner=(await db.query('SELECT id,name,mailing_address FROM owners WHERE id=$1 AND org_id=$2',[req.params.id,req.user.orgId])).rows[0];
    if(!owner)return res.status(404).json({error:{code:'NOT_FOUND',message:'Owner not found'}});
    const parts=String(owner.name||'').trim().split(/\\s+/);
    const firstName=b.firstName?String(b.firstName).trim():parts[0]||null;
    const lastName=b.lastName?String(b.lastName).trim():parts.slice(1).join(' ')||null;
    const result=await startFullEnrich({orgId:req.user.orgId,ownerId:owner.id,firstName,lastName,companyName:b.companyName,domain:b.domain,linkedinUrl:b.linkedinUrl,sourceKey:b.sourceKey});
    if(!result.enrichmentId)throw new Error('FullEnrich did not return an enrichment job id');
    await db.query("INSERT INTO owner_enrichment_runs(org_id,owner_id,source_name,provider_job_id,status) VALUES($1,$2,'fullenrich',$3,'running')",[req.user.orgId,owner.id,result.enrichmentId]);
    res.status(202).json({ok:true,provider:'fullenrich',result});
  }catch(e){console.error(e);res.status(502).json({error:{code:'OWNER_PROVIDER_ENRICHMENT_FAILED',message:e.message}});}
});

router.post('/:id/enrich',async(req,res)=>{
  if(!writable(req.user.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Owner enrichment denied'}});
  const b=req.body||{};
  try{
    const owner=(await db.query('SELECT id FROM owners WHERE id=$1 AND org_id=$2',[req.params.id,req.user.orgId])).rows[0];
    if(!owner)return res.status(404).json({error:{code:'NOT_FOUND',message:'Owner not found'}});
    const result=await enrichOwner({orgId:req.user.orgId,ownerId:owner.id,sourceName:String(b.sourceName||'manual_enrichment'),sourceUrl:b.sourceUrl?String(b.sourceUrl):null,sourceKey:b.sourceKey?String(b.sourceKey):null,contact:b.contact||{}});
    res.status(201).json({ok:true,result});
  }catch(e){console.error(e);res.status(500).json({error:{code:'OWNER_ENRICHMENT_FAILED',message:'Owner enrichment failed'}});}
});

router.get('/:id',async(req,res)=>{try{const owner=await db.query('SELECT id,name,phone,email,mailing_address,created_at FROM owners WHERE id=$1 AND org_id=$2',[req.params.id,req.user.orgId]);if(!owner.rows.length)return res.status(404).json({error:{code:'NOT_FOUND',message:'Owner not found'}});const properties=await db.query(`SELECT p.*,po.ownership_type,po.ownership_percent,po.is_primary FROM property_owners po JOIN properties p ON p.id=po.property_id AND p.org_id=$2 WHERE po.owner_id=$1 ORDER BY po.is_primary DESC,p.address`,[req.params.id,req.user.orgId]);const provenance=await db.query(`SELECT field_name,source_value,method,captured_at FROM provenance WHERE entity_type='owner' AND entity_id=$1 AND org_id=$2 ORDER BY captured_at DESC LIMIT 200`,[req.params.id,req.user.orgId]);res.json({owner:owner.rows[0],properties:properties.rows,provenance:provenance.rows});}catch(e){res.status(500).json({error:{code:'OWNER_READ_FAILED',message:'Unable to load owner'}});}});
router.post('/',async(req,res)=>{if(!writable(req.user.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Owner creation denied'}});const b=req.body||{},name=String(b.name||'').trim();if(!name)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Owner name is required'}});try{const r=await db.query('INSERT INTO owners(org_id,name,phone,email,mailing_address) VALUES($1,$2,$3,$4,$5) RETURNING id,name,phone,email,mailing_address,created_at',[req.user.orgId,name,b.phone?String(b.phone).trim():null,b.email?String(b.email).trim().toLowerCase():null,b.mailing_address?String(b.mailing_address).trim():null]);await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'owner.created','owner',$3,$4)`,[req.user.orgId,req.user.userId,r.rows[0].id,{source:'manual'}]);res.status(201).json({owner:r.rows[0]});}catch(e){console.error(e);res.status(500).json({error:{code:'OWNER_CREATE_FAILED',message:'Failed to create owner'}});}});
module.exports=router;
