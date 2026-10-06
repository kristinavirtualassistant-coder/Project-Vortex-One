const express=require('express');
const db=require('../db');
const auth=require('../middleware/auth');
const router=express.Router();

router.use(auth);

const COUNTIES={ '06037':'Los Angeles', '06075':'San Francisco' };

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

module.exports=router;
