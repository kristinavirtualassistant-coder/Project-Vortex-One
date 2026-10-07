const db=require('../db');

function normalizeName(value){return String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim().replace(/\\s+/g,' ');}
function normalizeEmail(value){const v=String(value||'').trim().toLowerCase();return v||null;}
function normalizePhone(value){const digits=String(value||'').replace(/\\D/g,'');return digits?digits:null;}

async function upsertContact({orgId,ownerId,contact,sourceName,sourceUrl,confidence=0.5}){
  const displayName=String(contact.displayName||contact.name||'').trim()||null;
  const email=normalizeEmail(contact.email);
  const phone=normalizePhone(contact.phone);
  let row;
  if(email){
    row=(await db.query('SELECT c.id FROM contacts c JOIN contact_emails ce ON ce.contact_id=c.id WHERE c.org_id=$1 AND c.owner_id=$2 AND LOWER(ce.email)=LOWER($3) LIMIT 1',[orgId,ownerId,email])).rows[0];
  }
  if(!row&&phone){
    row=(await db.query('SELECT c.id FROM contacts c JOIN contact_phones cp ON cp.contact_id=c.id WHERE c.org_id=$1 AND c.owner_id=$2 AND regexp_replace(cp.phone,\\'\\D\\',\\'\\',\\'g\\')=$3 LIMIT 1',[orgId,ownerId,phone])).rows[0];
  }
  if(!row){
    row=(await db.query('INSERT INTO contacts(org_id,owner_id,first_name,last_name,display_name,title,mailing_address) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[orgId,ownerId,contact.firstName||null,contact.lastName||null,displayName,contact.title||null,contact.mailingAddress||null])).rows[0];
  }
  if(email) await db.query('INSERT INTO contact_emails(contact_id,email,email_type,is_primary,confidence,source_name,source_url,source_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT(contact_id,email) DO UPDATE SET confidence=GREATEST(COALESCE(contact_emails.confidence,0),EXCLUDED.confidence),source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,source_updated_at=NOW()',[row.id,email,'enrichment',true,confidence,sourceName,sourceUrl||null]);
  if(phone) await db.query('INSERT INTO contact_phones(contact_id,phone,phone_type,is_primary,confidence,source_name,source_url,source_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) ON CONFLICT(contact_id,phone) DO UPDATE SET confidence=GREATEST(COALESCE(contact_phones.confidence,0),EXCLUDED.confidence),source_name=EXCLUDED.source_name,source_url=EXCLUDED.source_url,source_updated_at=NOW()',[row.id,phone,'enrichment',true,confidence,sourceName,sourceUrl||null]);
  return row.id;
}

async function recordEnrichment({orgId,ownerId,sourceName,sourceKey,sourceUrl,payload,confidence=0.5}){
  return db.query('INSERT INTO owner_enrichment_sources(org_id,owner_id,source_name,source_key,source_url,confidence,payload) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[orgId,ownerId,sourceName,sourceKey||null,sourceUrl||null,confidence,payload||{}]);
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
module.exports={normalizeName,normalizeEmail,normalizePhone,enrichOwner,upsertContact};
