const assert=require('node:assert/strict');
const {normalizeName,normalizeEmail,normalizePhone,extractFullEnrichContacts}=require('../services/ownerEnrichment');

assert.equal(normalizeName(' José  García, LLC '),'jose garcia llc');
assert.equal(normalizeEmail('  TEST@Example.COM '),'test@example.com');
assert.equal(normalizePhone('(415) 555-1212'),'4155551212');

const payload={
  status:'completed',
  data:[{
    contact:{
      first_name:'Jane',
      last_name:'Doe',
      title:'Owner',
      work_emails:[{email:'Jane.Doe@example.com'}],
      phones:[{phone:'+1 (415) 555-1212'}]
    }
  }]
};
const contacts=extractFullEnrichContacts(payload);
assert.equal(contacts.length,1);
assert.equal(contacts[0].firstName,'Jane');
assert.deepEqual(contacts[0].emails,['jane.doe@example.com']);
assert.deepEqual(contacts[0].phones,['14155551212']);

const duplicatePayload={data:[
  {contact:{name:'Jane Doe',emails:['jane.doe@example.com']}},
  {contact:{name:'Jane Doe',emails:['JANE.DOE@example.com'],phones:['14155551212']}}
]};
const deduped=extractFullEnrichContacts(duplicatePayload);
assert.equal(deduped.length,1);
assert.deepEqual(deduped[0].emails,['jane.doe@example.com']);
assert.deepEqual(deduped[0].phones,['14155551212']);

console.log('owner enrichment tests passed');
