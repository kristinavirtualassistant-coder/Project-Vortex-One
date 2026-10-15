const assert=require('node:assert/strict');
const {providerStatus}=require('../services/ownerEnrichmentWorker');
assert.equal(providerStatus({status:'completed'}),'completed');
assert.equal(providerStatus({data:{status:'succeeded'}}),'succeeded');
assert.equal(providerStatus({result:{status:'processing'}}),'processing');
assert.equal(providerStatus({}), '');
console.log('owner enrichment worker tests passed');
