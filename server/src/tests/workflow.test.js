const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const crypto=require('node:crypto');
const baseUrl=process.env.TEST_BASE_URL||'http://127.0.0.1:8080';
async function request(path,options={}){const r=await fetch(baseUrl+path,{...options,headers:{'content-type':'application/json','origin':baseUrl,...(options.headers||{})}});const body=await r.json().catch(()=>({}));return {r,body};}
async function signup(email){const x=await request('/api/auth/sign-up/email',{method:'POST',body:JSON.stringify({name:'Workflow Test',email,password:'Workflow-test-123!'})});assert.equal(x.r.status,200,JSON.stringify(x.body));const cookie=x.r.headers.get('set-cookie');assert.ok(cookie);return cookie.split(',').map(v=>v.trim().split(';')[0]).join('; ');}
(async()=>{const server=spawn(process.execPath,['server/src/index.js'],{env:{...process.env,PORT:'8080',BETTER_AUTH_SECRET:process.env.BETTER_AUTH_SECRET},stdio:['ignore','pipe','pipe']});try{for(let i=0;i<30;i++){try{if((await request('/api/health')).r.ok)break}catch{}await new Promise(r=>setTimeout(r,200));}
const c1=await signup('workflow-'+crypto.randomUUID()+'@example.test');
const made=await request('/api/tasks',{method:'POST',headers:{Cookie:c1},body:JSON.stringify({title:'Transient workflow verification'})});
assert.equal(made.r.status,201,JSON.stringify(made.body));
const property=await request('/api/property',{method:'POST',headers:{Cookie:c1},body:JSON.stringify({address:'Workflow isolation test'})});
assert.equal(property.r.status,201,JSON.stringify(property.body));
const lead=await request('/api/leads',{method:'POST',headers:{Cookie:c1},body:JSON.stringify({property_id:property.body.property.id,phone:'+15625550199',source:'workflow-test',status:'new'})});
assert.equal(lead.r.status,201,JSON.stringify(lead.body));
const updated=await request('/api/leads/'+lead.body.lead.id,{method:'PATCH',headers:{Cookie:c1},body:JSON.stringify({status:'interested',lead_score:85})});
assert.equal(updated.r.status,200,JSON.stringify(updated.body));assert.equal(updated.body.lead.status,'interested');assert.equal(Number(updated.body.lead.lead_score),85);
const note=await request('/api/leads/'+lead.body.lead.id+'/notes',{method:'POST',headers:{Cookie:c1},body:JSON.stringify({body:'Workflow note'})});
assert.equal(note.r.status,201,JSON.stringify(note.body));
const detail=await request('/api/leads/'+lead.body.lead.id,{headers:{Cookie:c1}});assert.equal(detail.r.status,200);assert.equal(detail.body.notes.length,1);assert.ok(detail.body.activities.length>=3);
const own=await request('/api/tasks',{headers:{Cookie:c1}});assert.equal(own.r.status,200);assert.equal(own.body.items.length,1);
const c2=await signup('workflow2-'+crypto.randomUUID()+'@example.test');
const other=await request('/api/tasks',{headers:{Cookie:c2}});assert.equal(other.r.status,200);assert.equal(other.body.items.length,0);
const cross=await request('/api/tasks',{method:'POST',headers:{Cookie:c2},body:JSON.stringify({title:'Must be rejected',property_id:property.body.property.id})});
assert.equal(cross.r.status,400,JSON.stringify(cross.body));assert.equal(cross.body.error.code,'CROSS_ORGANIZATION_REFERENCE');
const crossLead=await request('/api/leads',{method:'POST',headers:{Cookie:c2},body:JSON.stringify({property_id:property.body.property.id,phone:'+15625550198'})});
assert.equal(crossLead.r.status,400,JSON.stringify(crossLead.body));assert.equal(crossLead.body.error.code,'CROSS_ORGANIZATION_REFERENCE');
const hiddenLead=await request('/api/leads',{headers:{Cookie:c2}});assert.equal(hiddenLead.r.status,200);assert.equal(hiddenLead.body.length,0);
console.log('Workflow task, lead CRUD/activity, and cross-organization reference checks passed.');
}finally{server.kill('SIGTERM')}})().catch(e=>{console.error(e);process.exit(1)})
