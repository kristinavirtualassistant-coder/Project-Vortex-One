const assert=require('node:assert/strict');
const {normalize,hash,parseDate,arcgisGeometryToGeoJSON}=require('../services/publicRecordsIngestion');

const record=normalize({attributes:{APN:'123-456',OwnerName:'Jane Doe',LastSaleDate:'2024/02/03'},geometry:{x:-118.2,y:34.1}});
assert.equal(record.apn,'123-456');
assert.equal(record.ownerName,'Jane Doe');
assert.equal(parseDate(record.lastSaleDate),'2024-02-03');
assert.deepEqual(record.geometry,{type:'Point',coordinates:[-118.2,34.1]});

assert.equal(parseDate('2024-02-03'),'2024-02-03');
assert.equal(parseDate('not-a-date'),null);
assert.equal(parseDate(null),null);
assert.deepEqual(arcgisGeometryToGeoJSON({rings:[[[1,2],[3,4],[1,2]]]}),{type:'Polygon',coordinates:[[[1,2],[3,4],[1,2]]]});

const h1=hash(record);
const h2=hash(record);
assert.equal(h1,h2);
console.log('public-record ingestion tests passed');
