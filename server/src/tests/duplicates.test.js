const assert=require('node:assert/strict');
const{spawn}=require('node:child_process');
const crypto=require('node:crypto');
const baseUrl=process.env.TEST_BASE_URL||'http://127.0.0.1:8080';
async function request(path,options={}){const r=await fetch(baseUrl+path,{...options,headers:{'content-type':'application/json','origin':baseUrl,...(options.headers||{})}});const body=await r.json().catch(()=>({}));return{r,body};}
async function signup(email){const password=`D${crypto.randomBytes(24).toString('base64url')}!`;const x=await request('/api/auth/sign-up/email',{method:'POST',body:JSON.stringify({name:'Duplicate Test',email,password})});assert.equal(x.r.status,200,JSON.stringify(x.body));const cookie=x.r.headers.get('set-cookie');assert.ok(cookie);return cookie.split(',').map(v=>v.trim().split(';')[0]).join('; ');}
(async()=>{const server=spawn(process.execPath,['server/src/index.js'],{env:{...process.env,PORT:'8080'},stdio:['ignore','pipe','pipe']});try{for(let i=0;i<30;i++){try{if((await request('/api/health')).r.ok)break}catch{}await new Promise(r=>setTimeout(r,200));}
const c1=await signup('duplicates-'+crypto.randomUUID()+'@example.test');
const owner1=await request('/api/owners',{method:'POST',headers:{Cookie:c1},body:JSON.stringify({name:'Duplicate Review Owner'})});assert.equal(owner1.r.status,201,JSON.stringify(owner1.body));
const owner2=await request('/api/owners',{method:'POST',headers:{Cookie:c1},body:JSON.stringify({name:'Duplicate Review Owner'})});assert.equal(owner2.r.status,201,JSON.stringify(owner2.body));
const ownerDup=await request('/api/duplicates?status=review',{headers:{Cookie:c1}});assert.equal(ownerDup.r.status,200,JSON.stringify(ownerDup.body));assert.ok(ownerDup.body.items.some(x=>x.entity_type==='owner'));assert.ok(ownerDup.body.items.every(x=>x.entity_name&&x.candidate_name));
const property1=await request('/api/property',{method:'POST',headers:{Cookie:c1},body:JSON.stringify({address:'Duplicate Review Property'})});assert.equal(property1.r.status,201,JSON.stringify(property1.body));
const property2=await request('/api/property',{method:'POST',headers:{Cookie:c1},body:JSON.stringify({address:'Duplicate Review Property'})});assert.equal(property2.r.status,201,JSON.stringify(property2.body));
const propertyDup=await request('/api/duplicates?status=review',{headers:{Cookie:c1}});assert.ok(propertyDup.body.items.some(x=>x.entity_type==='property'));
const candidate=ownerDup.body.items.find(x=>x.entity_type==='owner');assert.ok(candidate);
const accepted=await request('/api/duplicates/'+candidate.id,{method:'PATCH',headers:{Cookie:c1},body:JSON.stringify({status:'accepted'})});assert.equal(accepted.r.status,200,JSON.stringify(accepted.body));assert.equal(accepted.body.candidate.status,'accepted');
const remaining=await request('/api/duplicates?status=review',{headers:{Cookie:c1}});assert.ok(remaining.body.items.every(x=>x.id!==candidate.id));
const c2=await signup('duplicates2-'+crypto.randomUUID()+'@example.test');const hidden=await request('/api/duplicates?status=review',{headers:{Cookie:c2}});assert.equal(hidden.r.status,200,JSON.stringify(hidden.body));assert.equal(hidden.body.items.length,0);
const crossPatch=await request('/api/duplicates/'+candidate.id,{method:'PATCH',headers:{Cookie:c2},body:JSON.stringify({status:'rejected'})});assert.equal(crossPatch.r.status,404,JSON.stringify(crossPatch.body));
console.log('Duplicate detection, review lifecycle, and organization isolation checks passed.');
}finally{server.kill('SIGTERM')}})().catch(e=>{console.error(e);process.exit(1)})