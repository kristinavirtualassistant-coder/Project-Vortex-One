const db=require('../db');
const {getFullEnrichResult,reconcileFullEnrich}=require('./ownerEnrichment');

const COMPLETED=new Set(['completed','complete','finished','success','succeeded']);
const FAILED=new Set(['failed','error','cancelled','canceled']);
const INTERVAL_MS=Math.max(15000,Number(process.env.OWNER_ENRICHMENT_WORKER_INTERVAL_MS)||60000);
const BATCH_SIZE=Math.min(100,Math.max(1,Number(process.env.OWNER_ENRICHMENT_WORKER_BATCH_SIZE)||25));
let timer=null;
let active=false;

function providerStatus(payload){
  return String(payload?.status||payload?.data?.status||payload?.result?.status||'').toLowerCase();
}

async function processRun(run){
  try{
    const payload=await getFullEnrichResult(run.provider_job_id);
    const status=providerStatus(payload);
    if(COMPLETED.has(status)){
      await reconcileFullEnrich({orgId:run.org_id,ownerId:run.owner_id,runId:run.id,payload,sourceKey:run.provider_job_id});
      return {runId:run.id,status:'completed'};
    }
    if(FAILED.has(status)){
      await db.query("UPDATE owner_enrichment_runs SET status='failed',completed_at=NOW(),error=$2 WHERE id=$1 AND org_id=$3 AND status='running'",[run.id,'Provider job ended with status: '+status,run.org_id]);
      return {runId:run.id,status:'failed'};
    }
    return {runId:run.id,status:status||'pending'};
  }catch(error){
    // Provider/network errors are transient: keep the run running for the next pass.
    console.error('[owner-enrichment-worker] run check failed',run.id,error.message);
    return {runId:run.id,status:'retrying'};
  }
}

async function tick(){
  if(active||!String(process.env.FULLENRICH_API_KEY||'').trim())return;
  active=true;
  try{
    const result=await db.query("SELECT id,org_id,owner_id,provider_job_id FROM owner_enrichment_runs WHERE source_name='fullenrich' AND status='running' AND provider_job_id IS NOT NULL ORDER BY requested_at ASC LIMIT $1",[BATCH_SIZE]);
    for(const run of result.rows)await processRun(run);
  }catch(error){
    console.error('[owner-enrichment-worker] batch failed',error.message);
  }finally{active=false;}
}

function startOwnerEnrichmentWorker(){
  if(timer)return;
  if(!String(process.env.FULLENRICH_API_KEY||'').trim()){
    console.log('[owner-enrichment-worker] disabled: FULLENRICH_API_KEY is not configured');
    return;
  }
  timer=setInterval(tick,INTERVAL_MS);
  timer.unref?.();
  tick().catch(error=>console.error('[owner-enrichment-worker] startup tick failed',error.message));
  console.log('[owner-enrichment-worker] started; interval='+INTERVAL_MS+'ms; batch='+BATCH_SIZE);
}

module.exports={startOwnerEnrichmentWorker,tick,providerStatus};
