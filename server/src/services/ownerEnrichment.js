const db=require('../db');

function normalizeName(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function normalizeEmail(value){const v=String(value||'').trim().toLowerCase();return v||null;}
function normalizePhone(value){const digits=String(value||'').replace(/\D/g,'');return digits?digits:null;}

function asArray(value){if(Array.isArray(value))return value;if(value==null)return[];return [value];}
function firstDefined(...values){return values.find(v=>v!==undefined&&v!==null&&v!=='');}

function extractFullEnrichContacts(payload){
  const candidates=[];
  const walk=(value)=>{
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){value.forEach(walk);return;}
    const contact=firstDefined(value.contact,value.contact_info,value.contactInfo,value.person);
    const emails=asArray(firstDefined(value.work_emails,value.workEmails,value.emails,value.email,contact?.work_emails,contact?.workEmails,contact?.emails,contact?.email));
    const phones=asArray(firstDefined(value.phones,value.phone_numbers,value.phoneNumbers,value.phone,contact?.phones,contact?.phone_numbers,contact?.phoneNumbers,contact?.phone));
    if(contact||emails.length||phones.length){
      const person=contact&&typeof contact==='object'?contact:value;
      const emailValues=emails.map(v=>typeof v==='object'?firstDefined(v.email,v.value,v.address):v).map(normalizeEmail).filter(Boolean);
      const phoneValues=phones.map(v=>typeof v==='object'?firstDefined(v.phone,v.value,v.number):v).map(normalizePhone).filter(Boolean);
      if(emailValues.length||phoneValues.length){
        candidates.push({
          firstName:firstDefined(person.first_name,person.firstName,person.firstname),
          lastName:firstDefined(person.last_name,person.lastName,person.lastname),
          displayName:firstDefined(person.display_name,person.displayName,person.name),
          title:firstDefined(person.title,person.job_title,person.jobTitle),
          mailingAddress:firstDefined(person.mailing_address,person.mailingAddress),
          emails:[...new Set(emailValues)],
          phones:[...new Set(phoneValues)],
          confidence:Number(firstDefined(value.confidence,person.confidence,0.9))||0.9
        });
      }
    }
    for(const key of ['data','results','contacts','records'])if(value[key])walk(value[key]);
  };
  walk(payload);
  const merged=new Map();
  for(const item of candidates){
    const key=normalizeEmail(item.emails[0])||normalizePhone(item.phones[0])||normalizeName(item.displayName||[item.firstName,item.lastName].filter(Boolean).join(' '));
    if(!key)continue;
    const existing=merged.get(key);
    if(!existing)merged.set(key,item);
    else{
      existing.emails=[...new Set(existing.emails.concat(item.emails))];
      existing.phones=[...new Set(existing.phones.concat(item.phones))];
      existing.confidence=Math.max(existing.confidence,item.confidence);
    }
  }
  return [...merged.values()];
}

async function upsertContact({orgId,ownerId,contact,sourceName,sourceUrl,confidence=0.5,executor=db}){
  const displayName=String(contact.displayName||contact.name||'').trim()||null;
  const email=normalizeEmail(contact.email);
  const phone=normalizePhone(contact.phone);
  let row;
  if(email) row=(await executor.query('SELECT c.id FROM contacts c JOIN contact_emails ce ON ce.contact_id=c.id WHERE c.org_id=$1 AND c.owner_id=$2 AND LOWER(ce.email)=LOWER($3) LIMIT 1',[orgId,ownerId,email])).rows[0];
  if(!row&&phone) row=(await executor.query("SELECT c.id FROM contacts c JOIN contact_phones cp ON cp.contact_id=c.id WHERE c.org_id=$1 AND c.owner_id=$2 AND regexp_replace(cp.phone,'\\D','','g')=$3 LIMIT 1",[orgId,ownerId,phone])).rows[0];
  if(!row) row=(await executor.query('INSERT INTO contacts(org_id,owner_id,first_name,last_name,display_name,title,mailing_address) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[orgId,ownerId,contact.firstName||null,contact.lastName||null,displayName,contact.title||null,contact.mailingAddress||null])).rows[0];
  if(email) await executor.query('INSERT INTO contact_emails(contact_id,email,email_type,is_primary,confidence,source_name,source_url,source_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT(contact_id,email) DO UPDATE SET confidence=GREATEST(COALESCE(contact_emails.confidence,0),EXCLUDED.confidence),source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,source_updated_at=NOW()',[row.id,email,'enrichment',true,confidence,sourceName,sourceUrl||null]);
  if(phone) await executor.query('INSERT INTO contact_phones(contact_id,phone,phone_type,is_primary,confidence,source_name,source_url,source_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT(contact_id,phone) DO UPDATE SET confidence=GREATEST(COALESCE(contact_phones.confidence,0),EXCLUDED.confidence),source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,source_updated_at=NOW()',[row.id,phone,'enrichment',true,confidence,sourceName,sourceUrl||null]);
  return row.id;
}

async function recordEnrichment({orgId,ownerId,sourceName,sourceKey,sourceUrl,payload,confidence=0.5,executor=db}){
  return executor.query('INSERT INTO owner_enrichment_sources(org_id,owner_id,source_name,source_key,source_url,confidence,payload) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[orgId,ownerId,sourceName,sourceKey||null,sourceUrl||null,confidence,payload||{}]);
}

async function enrichOwner({orgId,ownerId,sourceName='manual_enrichment',sourceUrl=null,sourceKey=null,contact={}}){
  const run=(await db.query("INSERT INTO owner_enrichment_runs(org_id,owner_id,source_name,status) VALUES($1,$2,$3,'running') RETURNING id",[orgId,ownerId,sourceName])).rows[0];
  try{
    await recordEnrichment({orgId,ownerId,sourceName,sourceKey,sourceUrl,payload:{contact},confidence:0.8});
    const contactId=await upsertContact({orgId,ownerId,contact,sourceName,sourceUrl,confidence:0.8});
    const phones=contact.phone?1:0,emails=contact.email?1:0;
    await db.query("UPDATE owner_enrichment_runs SET status='completed',completed_at=NOW(),contacts_found=1,phones_found=$2,emails_found=$3 WHERE id=$1",[run.id,phones,emails]);
    return {runId:run.id,contactId,phonesFound:phones,emailsFound:emails,status:'completed'};
  }catch(error){
    await db.query("UPDATE owner_enrichment_runs SET status='failed',completed_at=NOW(),error=$2 WHERE id=$1",[run.id,String(error.message).slice(0,2000)]).catch(()=>{});
    throw error;
  }
}

async function reconcileFullEnrich({orgId,ownerId,runId,payload,sourceKey}){
  const run=(await db.query("SELECT id,provider_job_id,status FROM owner_enrichment_runs WHERE id=$1 AND org_id=$2 AND owner_id=$3 AND source_name='fullenrich'",[runId,orgId,ownerId])).rows[0];
  if(!run)throw new Error('FullEnrich run not found');
  if(run.status==='completed')return {runId:run.id,status:'completed',idempotent:true,contactsFound:0,phonesFound:0,emailsFound:0};
  const contacts=extractFullEnrichContacts(payload);
  const client=await db.pool.connect();
  let phoneCount=0,emailCount=0;
  try{
    await client.query('BEGIN');
    await client.query('SELECT id FROM owner_enrichment_runs WHERE id=$1 AND org_id=$2 FOR UPDATE',[run.id,orgId]);
    await client.query('INSERT INTO owner_enrichment_sources(org_id,owner_id,source_name,source_key,source_url,confidence,payload) VALUES($1,$2,\'fullenrich\',$3,$4,$5,$6)',[orgId,ownerId,sourceKey||run.provider_job_id,null,contacts[0]?.confidence||0.9,payload||{}]);
    for(const contact of contacts){
      const base={firstName:contact.firstName,lastName:contact.lastName,displayName:contact.displayName,title:contact.title,mailingAddress:contact.mailingAddress};
      let contactId=null;
      for(const email of contact.emails){
        contactId=await upsertContact({orgId,ownerId,contact:{...base,email},sourceName:'fullenrich',sourceUrl:null,confidence:contact.confidence,executor:client});
        emailCount++;
        await client.query('INSERT INTO provenance(org_id,entity_type,entity_id,field_name,source_value,method) VALUES($1,\'contact\',$2,\'email\',$3,\'provider_enrichment\')',[orgId,contactId,email]);
      }
      for(const phone of contact.phones){
        contactId=await upsertContact({orgId,ownerId,contact:{...base,phone},sourceName:'fullenrich',sourceUrl:null,confidence:contact.confidence,executor:client});
        phoneCount++;
        await client.query('INSERT INTO provenance(org_id,entity_type,entity_id,field_name,source_value,method) VALUES($1,\'contact\',$2,\'phone\',$3,\'provider_enrichment\')',[orgId,contactId,phone]);
      }
    }
    await client.query("UPDATE owner_enrichment_runs SET status='completed',completed_at=NOW(),contacts_found=$2,phones_found=$3,emails_found=$4,error=NULL WHERE id=$1",[run.id,contacts.length,phoneCount,emailCount]);
    await client.query('COMMIT');
    return {runId:run.id,status:'completed',idempotent:false,contactsFound:contacts.length,phonesFound:phoneCount,emailsFound:emailCount};
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    await db.query("UPDATE owner_enrichment_runs SET status='failed',completed_at=NOW(),error=$2 WHERE id=$1 AND org_id=$3",[run.id,String(error.message).slice(0,2000),orgId]).catch(()=>{});
    throw error;
  }finally{client.release();}
}

async function startFullEnrich({orgId,ownerId,firstName,lastName,companyName,domain,linkedinUrl,sourceKey}){
  const apiKey=String(process.env.FULLENRICH_API_KEY||'').trim();
  if(!apiKey)throw new Error('FULLENRICH_API_KEY is not configured');
  const base=String(process.env.FULLENRICH_API_URL||'https://app.fullenrich.com').replace(/\/$/,'');
  const payload={name:'Vortex One owner enrichment',data:[{first_name:firstName||undefined,last_name:lastName||undefined,company_name:companyName||undefined,domain:domain||undefined,linkedin_url:linkedinUrl||undefined,enrich_fields:['contact.work_emails','contact.phones'],custom:{org_id:orgId,owner_id:ownerId,source_key:sourceKey||''}}]};
  const response=await fetch(base+'/api/v2/contact/enrich/bulk',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const text=await response.text();
  if(!response.ok)throw new Error('FullEnrich start failed: HTTP '+response.status+' '+text.slice(0,500));
  let data;try{data=JSON.parse(text);}catch{throw new Error('FullEnrich returned invalid JSON');}
  return {enrichmentId:data.enrichment_id||data.id||null,raw:data};
}

async function getFullEnrichResult(enrichmentId){
  const apiKey=String(process.env.FULLENRICH_API_KEY||'').trim();
  if(!apiKey)throw new Error('FULLENRICH_API_KEY is not configured');
  const base=String(process.env.FULLENRICH_API_URL||'https://app.fullenrich.com').replace(/\/$/,'');
  const response=await fetch(base+'/api/v2/contact/enrich/bulk/'+encodeURIComponent(enrichmentId),{headers:{Authorization:'Bearer '+apiKey,Accept:'application/json'}});
  const text=await response.text();
  if(!response.ok)throw new Error('FullEnrich result failed: HTTP '+response.status+' '+text.slice(0,500));
  try{return JSON.parse(text);}catch{throw new Error('FullEnrich returned invalid JSON');}
}

module.exports={normalizeName,normalizeEmail,normalizePhone,enrichOwner,upsertContact,extractFullEnrichContacts,reconcileFullEnrich,startFullEnrich,getFullEnrichResult};
