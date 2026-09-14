const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const intelligence = require('../services/propertyIntelligence');

const router = express.Router();
router.use(auth);

async function attachExistingOwnerMatches(orgId, properties) {
  if (!properties.length) return properties;
  const enriched = [];
  for (const property of properties) {
    const key = property.apn || property.ain || property.address;
    const result = await db.query(`
      SELECT DISTINCT o.id,o.name,o.phone,o.email,l.id AS lead_id,l.status,l.lead_score
      FROM properties p
      JOIN leads l ON l.property_id=p.id AND l.org_id=p.org_id
      JOIN owners o ON o.id=l.owner_id AND o.org_id=l.org_id
      WHERE p.org_id=$1 AND (p.apn=$2 OR p.ain=$2 OR LOWER(TRIM(p.address))=LOWER(TRIM($3)))
      ORDER BY l.updated_at DESC`, [orgId, key || '', property.address || '']);
    enriched.push({ ...property, owner_matches: result.rows, enrichment_status: result.rows.length ? 'matched_existing_org_record' : 'no_verified_owner_record' });
  }
  return enriched;
}

router.get('/status', async (req, res) => {
  try { res.json({ ok: true, sources: [await intelligence.sourceStatus()] }); }
  catch (err) { res.status(503).json({ ok: false, error: err.message }); }
});

router.get('/search', async (req, res) => {
  try {
    const { address, apn } = req.query;
    if (!address && !apn) return res.status(400).json({ error: 'address or apn is required' });
    const results = apn ? await intelligence.searchByApn(apn) : await intelligence.searchByAddress(address);
    const enriched = await attachExistingOwnerMatches(req.user.orgId, results);
    res.json({ ok: true, count: enriched.length, results: enriched });
  } catch (err) { res.status(502).json({ ok: false, error: err.message }); }
});

module.exports = router;
