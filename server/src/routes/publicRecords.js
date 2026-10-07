const express=require('express');
const db=require('../db');
const auth=require('../middleware/auth');
const {ingestSource}=require('../services/publicRecordsIngestion');
const router=express.Router();

router.use(auth);

const COUNTIES={ '06037':'Los Angeles', '06075':'San Francisco' };
const SOURCES={ '06037':{name:'California Public Records — Los Angeles County',url:'https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0'}, '06075':{name:'California Public Records — San Francisco',url:'https://data.sfgov.org/resource/wv5m-vpq2.json'} };
const writable=role=>['owner','admin','manager','rep'].includes(role);

router.get('/search',async(req,res)=>{
  try{
    const countyFips=String(req.query.countyFips||'').trim();
    const q=String(req.query.q||'').trim();
    const limit=Math.min(Math.max(Number(req.query.limit)||25,1),100);
    const offset=Math.max(Number(req.query.offset)||0,0);
    const params=[];
    const where=[];
    if(countyFips){params.push(countyFips);where.push('p.county_fips=$'+params.length);}
    if(q){
      const like='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
      const n=params.length+1;
      params.push(like,like,like,like,like);
      where.push('(p.apn ILIKE $'+n+' OR p.situs_address ILIKE $'+(n+1)+' OR p.situs_city ILIKE $'+(n+2)+' OR p.situs_zip ILIKE $'+(n+3)+' OR p.owner_name ILIKE $'+(n+4)+')');
    }
    const clause=where.length?' WHERE '+where.join(' AND '):'';
    const count=await db.query('SELECT COUNT(*)::int AS total FROM core.parcels p'+clause,params);
    const rows=await db.query(
      'SELECT p.*, CASE WHEN p.geom IS NULL THEN NULL ELSE ST_Y(ST_PointOnSurface(p.geom)) END AS latitude, CASE WHEN p.geom IS NULL THEN NULL ELSE ST_X(ST_PointOnSurface(p.geom)) END AS longitude, COALESCE((SELECT jsonb_agg(jsonb_build_object(\'signalType\',s.signal_type,\'observedOn\',s.observed_on,\'value\',s.value) ORDER BY s.observed_on DESC) FROM core.signals s WHERE s.county_fips=p.county_fips AND s.apn=p.apn),\'[]\'::jsonb) AS signals FROM core.parcels p'+clause+' ORDER BY p.situs_city NULLS LAST,p.situs_address NULLS LAST,p.apn LIMIT '+limit+' OFFSET '+offset,
      params
    );
    res.json({items:rows.rows.map(r=>({...r,countyName:COUNTIES[r.county_fips]||r.county_fips,source:'california_public_records'})),total:count.rows[0].total,limit,offset});
  }catch(err){
    console.error(err);
    res.status(500).json({error:{code:'PUBLIC_RECORD_SEARCH_FAILED',message:'Unable to search public records'}});
  }
});

router.get('/sources',async(req,res)=>{
  try{
    const rows=await db.query('SELECT id,name,county_fips,source_type,url,last_run_at,last_count,schema_hash FROM core.sources ORDER BY name');
    res.json({items:rows.rows});
  }catch(err){
    console.error(err);
    res.status(500).json({error:{code:'PUBLIC_RECORD_SOURCES_FAILED',message:'Unable to list public-record sources'}});
  }
});

router.get('/ingest-runs',async(req,res)=>{
  try{
    const limit=Math.min(Math.max(Number(req.query.limit)||25,1),100);
    const rows=await db.query('SELECT r.id,r.source_id,s.name AS source_name,r.status,r.started_at,r.finished_at,r.fetched,r.changed,r.error FROM core.ingest_runs r JOIN core.sources s ON s.id=r.source_id ORDER BY r.started_at DESC LIMIT $1',[limit]);
    res.json({items:rows.rows});
  }catch(err){
    console.error(err);
    res.status(500).json({error:{code:'PUBLIC_RECORD_INGEST_RUNS_FAILED',message:'Unable to list ingestion runs'}});
  }
});

router.post('/ingest',async(req,res)=>{
  if(!['admin','owner','manager'].includes(req.user.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Public-record ingestion requires an administrator role'}});
  const sourceId=String(req.body?.sourceId||'').trim();
  if(!sourceId)return res.status(400).json({error:{code:'SOURCE_REQUIRED',message:'sourceId is required'}});
  try{const result=await ingestSource(sourceId,{maxRecords:req.body?.maxRecords});res.status(202).json(result);}
  catch(err){console.error(err);res.status(502).json({error:{code:'PUBLIC_RECORD_INGEST_FAILED',message:err.message}});}
});
router.post('/import',async(req,res)=>{
  if(!writable(req.user.role)) return res.status(403).json({error:{code:'FORBIDDEN',message:'Public-record import denied'}});
  const parcels=Array.isArray(req.body?.parcels)?req.body.parcels.slice(0,100):[];
  if(!parcels.length) return res.status(400).json({error:{code:'PARCELS_REQUIRED',message:'At least one parcel is required'}});
  const client=await db.pool.connect(); const imported=[],skipped=[],errors=[];
  try{ await client.query('BEGIN');
    for(const item of parcels){
      const countyFips=String(item.countyFips||item.county_fips||'').trim(); const apn=String(item.apn||'').trim();
      if(!countyFips||!apn){errors.push({countyFips,apn,error:'countyFips and apn are required'});continue;}
      const source=SOURCES[countyFips]||{name:'California Public Records',url:null};
      const parcel=(await client.query('SELECT * FROM core.parcels WHERE county_fips=$1 AND apn=$2 LIMIT 1',[countyFips,apn])).rows[0];
      if(!parcel){errors.push({countyFips,apn,error:'Parcel not found'});continue;}
      const existing=(await client.query("SELECT id FROM properties WHERE org_id=$1 AND ((apn IS NOT NULL AND apn=$2) OR (address=$3 AND COALESCE(city,'')=COALESCE($4,''))) LIMIT 1",[req.user.orgId,apn,parcel.situs_address||'Unknown address',parcel.situs_city])).rows[0];
      let propertyId=existing?.id;
      if(existing){skipped.push({countyFips,apn,propertyId,reason:'property_exists'});}
      else{
        const property=(await client.query("INSERT INTO properties(org_id,address,city,state,zip,county,apn,property_type,units,year_built,sqft,lot_size_sqft,land_value,improvement_value,latitude,longitude,source_name,source_url) VALUES($1,$2,$3,'CA',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CASE WHEN $14 IS NULL THEN NULL ELSE ST_Y(ST_PointOnSurface($14)) END,CASE WHEN $14 IS NULL THEN NULL ELSE ST_X(ST_PointOnSurface($14)) END,$15,$16) RETURNING id",[req.user.orgId,parcel.situs_address||'Unknown address',parcel.situs_city,parcel.situs_zip,COUNTIES[countyFips]||countyFips,apn,parcel.use_code,parcel.units,parcel.year_built,parcel.building_sqft,parcel.lot_sqft,parcel.land_value,parcel.improvement_value,parcel.geom,source.name,source.url])).rows[0];
        propertyId=property.id; imported.push({countyFips,apn,propertyId});
      }
      if(parcel.owner_name){
        let owner=(await client.query('SELECT id FROM owners WHERE org_id=$1 AND name=$2 LIMIT 1',[req.user.orgId,parcel.owner_name.trim()])).rows[0];
        if(!owner) owner=(await client.query('INSERT INTO owners(org_id,name,mailing_address) VALUES($1,$2,$3) RETURNING id',[req.user.orgId,parcel.owner_name.trim(),parcel.mail_address||null])).rows[0];
        await client.query("INSERT INTO property_owners(property_id,owner_id,org_id,ownership_type,is_primary) VALUES($1,$2,$3,'record_owner',true) ON CONFLICT(property_id,owner_id) DO NOTHING",[propertyId,owner.id,req.user.orgId]);
      }
      await client.query("INSERT INTO provenance(org_id,entity_type,entity_id,field_name,source_value,method) VALUES($1,'property',$2,'public_record',$3,'public_record_import')",[req.user.orgId,propertyId,JSON.stringify({countyFips,apn,source:source.name})]);
    }
    await client.query('COMMIT'); res.status(201).json({importedCount:imported.length,skippedCount:skipped.length,errorCount:errors.length,imported,skipped,errors});
  }catch(err){await client.query('ROLLBACK');console.error(err);res.status(500).json({error:{code:'PUBLIC_RECORD_IMPORT_FAILED',message:'Unable to import public records'}});}finally{client.release();}
});

module.exports=router;
