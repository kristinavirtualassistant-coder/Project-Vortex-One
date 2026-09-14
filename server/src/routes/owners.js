const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const params = [req.user.orgId];
    let sql = `SELECT o.id,o.name,o.phone,o.email,
      COUNT(DISTINCT l.id)::int AS lead_count,
      COUNT(DISTINCT p.id)::int AS property_count
      FROM owners o
      LEFT JOIN leads l ON l.owner_id=o.id AND l.org_id=o.org_id
      LEFT JOIN properties p ON p.id=l.property_id AND p.org_id=o.org_id
      WHERE o.org_id=$1`;
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (o.name ILIKE $2 OR o.phone ILIKE $2 OR o.email ILIKE $2)`;
    }
    params.push(limit);
    sql += ` GROUP BY o.id ORDER BY o.name ASC LIMIT $${params.length}`;
    const result = await db.query(sql, params);
    res.json({ ok:true, count:result.rows.length, owners:result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'Failed to load owners' });
  }
});

router.get('/match', async (req, res) => {
  try {
    const { apn, address } = req.query;
    if (!apn && !address) return res.status(400).json({ error:'apn or address is required' });
    const params = [req.user.orgId];
    let where = '';
    if (apn) {
      params.push(String(apn).trim());
      where = `p.apn=$2 OR p.ain=$2`;
    } else {
      params.push(String(address).trim());
      where = `LOWER(TRIM(p.address))=LOWER(TRIM($2))`;
    }
    const result = await db.query(`
      SELECT DISTINCT o.id,o.name,o.phone,o.email,l.id AS lead_id,l.status,l.lead_score,
        p.id AS property_id,p.address,p.apn,p.ain
      FROM properties p
      JOIN leads l ON l.property_id=p.id AND l.org_id=p.org_id
      JOIN owners o ON o.id=l.owner_id AND o.org_id=l.org_id
      WHERE p.org_id=$1 AND (${where})
      ORDER BY l.updated_at DESC`, params);
    res.json({
      ok:true,
      count:result.rows.length,
      matched:result.rows.length > 0,
      enrichment_status:result.rows.length ? 'matched_existing_org_record' : 'no_verified_owner_record',
      owners:result.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'Owner match failed' });
  }
});

router.post('/import', async (req, res) => {
  try {
    if (!Array.isArray(req.body?.owners) || req.body.owners.length === 0) {
      return res.status(400).json({ error:'owners must be a non-empty array' });
    }
    if (req.body.owners.length > 1000) return res.status(413).json({ error:'Maximum 1000 owners per import' });

    const imported = [];
    for (const row of req.body.owners) {
      const name = String(row.name || '').trim();
      if (!name) continue;
      const phone = row.phone ? String(row.phone).trim() : null;
      const email = row.email ? String(row.email).trim().toLowerCase() : null;
      const propertyAddress = row.property_address ? String(row.property_address).trim() : null;
      const apn = row.apn ? String(row.apn).trim() : null;

      const owner = await db.query(`
        SELECT id FROM owners
        WHERE org_id=$1 AND LOWER(name)=LOWER($2)
          AND COALESCE(phone,'')=COALESCE($3,'')
          AND COALESCE(email,'')=COALESCE($4,'')
        LIMIT 1`, [req.user.orgId,name,phone,email]);
      const ownerId = owner.rows[0]?.id || (await db.query(
        `INSERT INTO owners(org_id,name,phone,email) VALUES($1,$2,$3,$4) RETURNING id`,
        [req.user.orgId,name,phone,email]
      )).rows[0].id;

      let propertyId = null;
      if (propertyAddress || apn) {
        const property = await db.query(`SELECT id FROM properties WHERE org_id=$1 AND (${apn ? 'apn=$2' : 'LOWER(TRIM(address))=LOWER(TRIM($2))'}) LIMIT 1`, [req.user.orgId, apn || propertyAddress]);
        propertyId = property.rows[0]?.id || null;
      }
      if (propertyId) {
        const existingLead = await db.query(`SELECT id FROM leads WHERE org_id=$1 AND owner_id=$2 AND property_id=$3 LIMIT 1`, [req.user.orgId,ownerId,propertyId]);
        if (!existingLead.rows.length) {
          await db.query(`INSERT INTO leads(org_id,owner_id,property_id,phone,status) VALUES($1,$2,$3,$4,'new')`, [req.user.orgId,ownerId,propertyId,phone]);
        }
      }
      imported.push({ owner_id:ownerId, property_id:propertyId, name, phone, email });
    }
    res.status(201).json({ ok:true, count:imported.length, imported });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'Owner import failed' });
  }
});

module.exports = router;
