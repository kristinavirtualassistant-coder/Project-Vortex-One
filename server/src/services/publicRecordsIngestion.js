const crypto=require('node:crypto');
const https=require('node:https');
const db=require('../db');

const SOURCES={la_parcels:{kind:'arcgis',countyFips:'06037',url:'https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0'}};

function getJson(url){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{'User-Agent':'Vortex-One/1.0',Accept:'application/json'}},res=>{
      let body='';res.setEncoding('utf8');
      res.on('data',chunk=>{body+=chunk;if(body.length>25*1024*1024)req.destroy(new Error('Source response exceeded 25 MB'));});
      res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(new Error('Source returned HTTP '+res.statusCode));try{resolve(JSON.parse(body));}catch{reject(new Error('Source returned invalid JSON'));}});
    });
    req.setTimeout(15000,()=>req.destroy(new Error('Source request timed out')));req.on('error',reject);
  });
}
function first(a,names){for(const n of names)if(a[n]!==undefined&&a[n]!==null&&String(a[n]).trim()!=='')return a[n];return null;}
function normalize(feature){
  const a=feature?.attributes||{};const apn=first(a,['APN','AIN','APNFormatted','PARCELID']);if(!apn)return null;
  return {sourceKey:String(first(a,['OBJECTID','FID','APN','AIN'])||apn),apn:String(apn),apnRaw:first(a,['APN','AIN']),situsAddress:first(a,['SitusFullAddress','SitusAddress','SITEADDRESS','SitusAddr']),situsCity:first(a,['SitusCity','CITY','City']),situsZip:first(a,['SitusZIP','ZIP','Zip']),ownerName:first(a,['OwnerName','Owner','OWNERNAME','OwnerFullName']),mailAddress:first(a,['MailAddress','MailingAddress','OwnerMailAddress']),useCode:first(a,['UseCode','UseType','UseTypeCode']),units:first(a,['Units1','Units','UnitCount']),yearBuilt:first(a,['YearBuilt1','YearBuilt']),buildingSqft:first(a,['SQFTmain1','BuildingSqft','SQFT']),lotSqft:first(a,['LotSqft','LotSizeSqft']),landValue:first(a,['Roll_LandValue','LandValue']),improvementValue:first(a,['Roll_ImpValue','ImprovementValue']),baseYear:first(a,['BaseYear','RollYear']),lastSaleDate:first(a,['LastSaleDate','SaleDate']),homeownerExempt:first(a,['HomeownerExempt','HOExempt']),attrs:a,geometry:arcgisGeometryToGeoJSON(feature.geometry)};
}
function parseDate(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const s=String(value).trim();
  if(/^\\d{4}-\\d{2}-\\d{2}$/.test(s))return s;
  const d=new Date(s);
  if(Number.isNaN(d.getTime()))return null;
  return d.toISOString().slice(0,10);
}
function arcgisGeometryToGeoJSON(geometry){
  if(!geometry)return null;
  if(geometry.type&&geometry.coordinates)return geometry;
  if(geometry.x!==undefined&&geometry.y!==undefined)return {type:'Point',coordinates:[Number(geometry.x),Number(geometry.y)]};
  if(Array.isArray(geometry.rings))return {type:'Polygon',coordinates:geometry.rings};
  if(Array.isArray(geometry.paths))return {type:'MultiLineString',coordinates:geometry.paths};
  return null;
}
function hash(record){return crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');}
async function fetchArcgis(source,maxRecords){
  const features=[];let offset=0;const pageSize=Math.min(maxRecords,1000);
  while(features.length<maxRecords){
    const u=new URL(source.url+'/query');u.searchParams.set('where','1=1');u.searchParams.set('outFields','*');u.searchParams.set('returnGeometry','true');u.searchParams.set('f','json');u.searchParams.set('resultRecordCount',String(Math.min(pageSize,maxRecords-features.length)));u.searchParams.set('resultOffset',String(offset));
    const data=await getJson(u.toString());if(data.error)throw new Error(data.error.message||'ArcGIS query failed');
    const batch=data.features||[];features.push(...batch);if(!batch.length||batch.length<pageSize||data.exceededTransferLimit===false)break;offset+=batch.length;
  }return features;
}
async function ingestSource(sourceId,{maxRecords=1000}={}){
  const source=SOURCES[sourceId];if(!source)throw new Error('Unsupported ingestion source: '+sourceId);
  const limit=Math.min(Math.max(Number(maxRecords)||1000,1),10000);
  const run=(await db.query("INSERT INTO core.ingest_runs(source_id,status) VALUES($1,'running') RETURNING id",[sourceId])).rows[0];
  let fetched=0,changed=0;
  try{
    const features=await fetchArcgis(source,limit);fetched=features.length;const client=await db.pool.connect();
    try{
      await client.query('BEGIN');
      for(const feature of features){
        const record=normalize(feature);if(!record)continue;const rowHash=hash(record);const geom=record.geometry?JSON.stringify(record.geometry):null;
        const raw=await client.query(`INSERT INTO raw.records(source_id,source_key,roll_year,attrs,geom,row_hash) VALUES($1,$2,$3,$4::jsonb,CASE WHEN $5::jsonb IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($5::jsonb),4326) END,$6) ON CONFLICT(source_id,source_key,roll_year) DO UPDATE SET attrs=EXCLUDED.attrs,geom=EXCLUDED.geom,row_hash=EXCLUDED.row_hash,last_seen=NOW() WHERE raw.records.row_hash<>EXCLUDED.row_hash RETURNING row_hash`,[sourceId,record.sourceKey,Number(record.baseYear)||0,record.attrs,geom,rowHash]);
        if(raw.rowCount)changed++;
        await client.query(`INSERT INTO core.parcels(county_fips,apn,apn_raw,situs_address,situs_city,situs_zip,owner_name,mail_address,use_code,units,year_built,building_sqft,lot_sqft,land_value,improvement_value,base_year,last_sale_date,homeowner_exempt,geom,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NULLIF($18,'')::date,$19,CASE WHEN $20::jsonb IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($20::jsonb),4326) END,NOW()) ON CONFLICT(county_fips,apn) DO UPDATE SET apn_raw=EXCLUDED.apn_raw,situs_address=EXCLUDED.situs_address,situs_city=EXCLUDED.situs_city,situs_zip=EXCLUDED.situs_zip,owner_name=EXCLUDED.owner_name,mail_address=EXCLUDED.mail_address,use_code=EXCLUDED.use_code,units=EXCLUDED.units,year_built=EXCLUDED.year_built,building_sqft=EXCLUDED.building_sqft,lot_sqft=EXCLUDED.lot_sqft,land_value=EXCLUDED.land_value,improvement_value=EXCLUDED.improvement_value,base_year=EXCLUDED.base_year,last_sale_date=EXCLUDED.last_sale_date,homeowner_exempt=EXCLUDED.homeowner_exempt,geom=EXCLUDED.geom,updated_at=NOW()`,[source.countyFips,record.apn,record.apnRaw,record.situsAddress,record.situsCity,record.situsZip,record.ownerName,record.mailAddress,record.useCode,Number(record.units)||null,Number(record.yearBuilt)||null,Number(record.buildingSqft)||null,Number(record.lotSqft)||null,Number(record.landValue)||null,Number(record.improvementValue)||null,Number(record.baseYear)||null,parseDate(record.lastSaleDate)||'',record.homeownerExempt===null?null:Boolean(record.homeownerExempt),geom]);
      }
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    const schemaHash=crypto.createHash('sha256').update(JSON.stringify(Object.keys(features[0]?.attributes||{}).sort())).digest('hex');
    await db.query('UPDATE core.sources SET last_run_at=NOW(),last_count=$2,schema_hash=$3 WHERE id=$1',[sourceId,fetched,schemaHash]);
    await db.query("UPDATE core.ingest_runs SET finished_at=NOW(),fetched=$2,changed=$3,status='completed' WHERE id=$1",[run.id,fetched,changed]);
    return {runId:run.id,sourceId,fetched,changed,status:'completed'};
  }catch(error){
    await db.query("UPDATE core.ingest_runs SET finished_at=NOW(),fetched=$2,changed=$3,status='failed',error=$4 WHERE id=$1",[run.id,fetched,changed,String(error.message).slice(0,2000)]).catch(()=>{});
    throw error;
  }
}
module.exports={ingestSource};