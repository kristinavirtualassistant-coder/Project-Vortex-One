const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const suffix = crypto.randomUUID();
const email1 = `m1-owner-${suffix}@example.test`;
const email2 = `m1-owner2-${suffix}@example.test`;
const password = 'M1-test-password-123!';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  const body=await response.json().catch(()=>({}));
  return {response,body};
}

async function signup(email,name){
  const result=await request('/api/auth/sign-up/email',{method:'POST',body:JSON.stringify({name,email,password})});
  assert.equal(result.response.status,200,JSON.stringify(result.body));
  const setCookie=result.response.headers.get('set-cookie');
  assert.ok(setCookie,'Better Auth signup did not set a session cookie');
  const cookie=setCookie.split(',').map(v=>v.trim().split(';')[0]).join('; ');
  return cookie;
}

async function waitForHealth(){for(let i=0;i<40;i+=1){try{const {response}=await request('/api/health');if(response.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('Vortex One server did not become healthy');}

(async()=>{
  const server=spawn(process.execPath,['server/src/index.js'],{env:{...process.env,PORT:'8080',BETTER_AUTH_SECRET:process.env.BETTER_AUTH_SECRET||'m1-better-auth-secret-012345678901234567890123'},stdio:['ignore','pipe','pipe']}); let stderr=''; server.stderr.on('data',c=>{stderr+=c.toString();});
  try{
    await waitForHealth();
    const cookie1=await signup(email1,'M1 Owner'); const auth1={Cookie:cookie1};
    const dashboard1=await request('/api/foundation/dashboard',{headers:auth1}); assert.equal(dashboard1.response.status,200,JSON.stringify(dashboard1.body)); assert.deepEqual(dashboard1.body.counts,{properties:0,owners:0,leads:0,calls:0,members:1});
    const members1=await request('/api/foundation/members',{headers:auth1}); assert.equal(members1.response.status,200,JSON.stringify(members1.body)); assert.equal(members1.body.items.length,1); assert.equal(members1.body.items[0].role,'owner');
    const settings1=await request('/api/foundation/settings',{headers:auth1}); assert.equal(settings1.response.status,200,JSON.stringify(settings1.body)); assert.deepEqual(settings1.body.settings,{});
    const audit1=await request('/api/foundation/audit',{headers:auth1}); assert.equal(audit1.response.status,200,JSON.stringify(audit1.body)); assert.ok(audit1.body.items.some(item=>item.action==='organization.created'));
    const signedOut=await request('/api/foundation/dashboard'); assert.equal(signedOut.response.status,401);
    const csv=['property_address,city,state,zip,county,apn,property_type,units,bedrooms,bathrooms,sqft,year_built,owner_name,owner_phone,owner_email,mailing_address','123 Test Ave,Long Beach,CA,90802,Los Angeles,123-456-789,multifamily,4,4,4,3200,1965,Alex Example,5625550100,alex@example.test,123 Test Ave Long Beach CA 90802','124 Test Ave,Long Beach,CA,90802,Los Angeles,123-456-790,duplex,2,2,2,1600,1970,Jordan Example,5625550101,jordan@example.test,900 Owner St Long Beach CA 90805'].join('\n');
    const preview=await request('/api/imports/preview',{method:'POST',headers:auth1,body:JSON.stringify({csv})}); assert.equal(preview.response.status,200,JSON.stringify(preview.body)); assert.equal(preview.body.totalRows,2); assert.equal(preview.body.preview.length,2);
    const importResult=await request('/api/imports/csv',{method:'POST',headers:auth1,body:JSON.stringify({filename:'m2-fixture.csv',csv})}); assert.equal(importResult.response.status,201,JSON.stringify(importResult.body)); assert.equal(importResult.body.totalRows,2); assert.equal(importResult.body.importedRows,2);
    const search=await request('/api/property/search?page=1&pageSize=10&city=Long%20Beach',{headers:auth1}); assert.equal(search.response.status,200,JSON.stringify(search.body)); assert.equal(search.body.total,2); assert.equal(search.body.items.length,2); assert.equal(search.body.items[0].owners.length,1); assert.equal(search.body.provenance.adapter,'InternalPostgresAdapter');
    const profile=await request(`/api/property/${search.body.items[0].id}`,{headers:auth1}); assert.equal(profile.response.status,200,JSON.stringify(profile.body)); assert.equal(profile.body.owners.length,1); assert.ok(profile.body.provenance.length>0);
    const cookie2=await signup(email2,'M1 Owner 2');
    const dashboard2=await request('/api/foundation/dashboard',{headers:{Cookie:cookie2}}); assert.equal(dashboard2.response.status,200,JSON.stringify(dashboard2.body)); assert.deepEqual(dashboard2.body.counts,{properties:0,owners:0,leads:0,calls:0,members:1});
    const crossOrgMembers=await request('/api/foundation/members',{headers:auth1}); assert.equal(crossOrgMembers.body.items.length,1); assert.notEqual(crossOrgMembers.body.items[0].email,email2);
    const crossOrgSearch=await request('/api/property/search?page=1&pageSize=10',{headers:{Cookie:cookie2}}); assert.equal(crossOrgSearch.response.status,200,JSON.stringify(crossOrgSearch.body)); assert.equal(crossOrgSearch.body.total,0);
    console.log('M1 Better Auth and M2 property intelligence integration checks passed.');
  }finally{server.kill('SIGTERM');if(stderr)process.stderr.write(stderr);}
})().catch(error=>{console.error(error);process.exit(1);});
