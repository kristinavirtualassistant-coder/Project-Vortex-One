const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const SORTS = {
  address: 'p.address ASC',
  city: 'p.city ASC',
  year_built: 'p.year_built DESC NULLS LAST',
  units: 'p.units DESC NULLS LAST',
  sqft: 'p.sqft DESC NULLS LAST',
  created_at: 'p.created_at DESC'
};

function intParam(value, fallback, max) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

router.get('/status', (req,res) => res.json({ ok:true, source:'InternalPostgresAdapter', externalProviders:[] }));

router.get('/search', async (req,res) => {
  try {
    const page = intParam(req.query.page, 1, 1000000);
    const pageSize = intParam(req.query.pageSize, 25, 100);
    const offset = (page - 1) * pageSize;
    const q = String(req.query.q || '').trim();
    const state = String(req.query.state || '').trim();
    const county = String(req.query.county || '').trim();
    const zip = String(req.query.zip || '').trim();
    const propertyType = String(req.query.propertyType || '').trim();
    const apn = String(req.query.apn || '').trim();
    const minUnits = req.query.minUnits !== undefined ? Number(req.query.minUnits) : null;
    const maxUnits = req.query.maxUnits !== undefined ? Number(req.query.maxUnits) : null;
    const sort = SORTS[String(req.query.sort || 'address')] || SORTS.address;
    const params = [req.user.orgId];
    const where = ['p.org_id=$1'];
    if (q) { params.push(`%${q}%`); where.push(`(p.address ILIKE $${params.length} OR p.city ILIKE $${params.length} OR p.apn ILIKE $${params.length} OR EXISTS (SELECT 1 FROM property_owners pq JOIN owners oq ON oq.id=pq.owner_id WHERE pq.property_id=p.id AND oq.org_id=p.org_id AND oq.name ILIKE $${params.length}))`); }
    if (state) { params.push(state); where.push(`p.state=$${params.length}`); }
    if (county) { params.push(county); where.push(`p.county ILIKE $${params.length}`); }
    if (zip) { params.push(zip); where.push(`p.zip=$${params.length}`); }
    if (propertyType) { params.push(propertyType); where.push(`p.property_type=$${params.length}`); }
    if (apn) { params.push(apn); where.push(`(p.apn=$${params.length} OR p.ain=$${params.length})`); }
    if (Number.isFinite(minUnits)) { params.push(minUnits); where.push(`p.units >= $${params.length}`); }
    if (Number.isFinite(maxUnits)) { params.push(maxUnits); where.push(`p.units <= $${params.length}`); }
    const count = await db.query(`SELECT COUNT(*)::int AS total FROM properties p WHERE ${where.join(' AND ')}`, params);
    const total = count.rows[0].total;
    params.push(pageSize, offset);
    const result = await db.query(`
      SELECT p.id,p.address,p.city,p.state,p.zip,p.county,p.apn,p.ain,p.property_type,p.units,p.bedrooms,p.bathrooms,p.sqft,p.lot_size_sqft,p.year_built,p.zoning,p.occupancy,p.mailing_address,p.latitude,p.longitude,p.created_at,
        COALESCE(json_agg(DISTINCT jsonb_build_object('id',o.id,'name',o.name,'phone',o.phone,'email',o.email)) FILTER (WHERE o.id IS NOT NULL),'[]') AS owners
      FROM properties p
      LEFT JOIN property_owners po ON po.property_id=p.id
      LEFT JOIN owners o ON o.id=po.owner_id AND o.org_id=p.org_id
      WHERE ${where.join(' AND ')}
      GROUP BY p.id ORDER BY ${sort} LIMIT $${params.length-1} OFFSET $${params.length}` , params);
    res.json({ items: result.rows, page, pageSize, total, provenance: { adapter:'InternalPostgresAdapter', source:'organization_database' } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error:{ code:'PROPERTY_SEARCH_FAILED', message:'Property search failed' } });
  }
});

router.get('/:id', async (req,res) => {
  try {
    const property = await db.query(`SELECT * FROM properties WHERE id=$1 AND org_id=$2`, [req.params.id,req.user.orgId]);
    if (!property.rows.length) return res.status(404).json({ error:{code:'NOT_FOUND',message:'Property not found'} });
    const owners = await db.query(`SELECT o.id,o.name,o.phone,o.email,o.mailing_address,po.ownership_type,po.ownership_percent,po.is_primary FROM property_owners po JOIN owners o ON o.id=po.owner_id AND o.org_id=$2 WHERE po.property_id=$1 ORDER BY po.is_primary DESC,o.name`, [req.params.id,req.user.orgId]);
    const provenance = await db.query(`SELECT field_name,source_value,method,captured_at FROM provenance WHERE entity_type='property' AND entity_id=$1 AND org_id=$2 ORDER BY captured_at DESC LIMIT 200`, [req.params.id,req.user.orgId]);
    res.json({ property:property.rows[0], owners:owners.rows, provenance:provenance.rows });
  } catch (err) { res.status(500).json({ error:{code:'PROPERTY_READ_FAILED',message:'Unable to load property'} }); }
});

router.post('/', async (req,res) => {
  try {
    const body=req.body||{};
    if (!String(body.address||'').trim()) return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Address is required'}});
    const result=await db.query(`INSERT INTO properties(org_id,address,city,state,zip,county,apn,property_type,units,bedrooms,bathrooms,sqft,lot_size_sqft,year_built,zoning,occupancy,mailing_address) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`, [req.user.orgId,body.address.trim(),body.city||null,body.state||null,body.zip||null,body.county||null,body.apn||null,body.property_type||null,body.units||null,body.bedrooms||null,body.bathrooms||null,body.sqft||null,body.lot_size_sqft||null,body.year_built||null,body.zoning||null,body.occupancy||null,body.mailing_address||null]);
    await db.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'property.created','property',$3,$4)`, [req.user.orgId,req.user.userId,result.rows[0].id,{source:'manual'}]);
    res.status(201).json({property:result.rows[0]});
  } catch (err) { console.error(err); res.status(500).json({error:{code:'PROPERTY_CREATE_FAILED',message:'Unable to create property'}}); }
});

module.exports = router;
