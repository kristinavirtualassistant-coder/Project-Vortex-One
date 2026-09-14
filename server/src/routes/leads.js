const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();
router.use(auth);

router.get('/', async (req,res) => {
  try {
    const result = await db.query(`SELECT l.id,l.status,l.lead_score,l.phone,l.next_followup_date,l.next_followup_time,o.name AS owner_name,o.phone AS callback_number,p.address AS property_address FROM leads l LEFT JOIN owners o ON o.id=l.owner_id LEFT JOIN properties p ON p.id=l.property_id WHERE l.org_id=$1 ORDER BY l.updated_at DESC LIMIT $2`, [req.user.orgId, Math.min(Number(req.query.limit)||50,200)]);
    res.json(result.rows);
  } catch(e) { console.error(e); res.status(500).json({error:'Failed to load leads'}); }
});
module.exports=router;
