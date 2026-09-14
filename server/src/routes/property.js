const express = require('express');
const auth = require('../middleware/auth');
const intelligence = require('../services/propertyIntelligence');
const router = express.Router();
router.use(auth);
router.get('/status', async (req, res) => { try { res.json({ ok: true, sources: [await intelligence.sourceStatus()] }); } catch (err) { res.status(503).json({ ok: false, error: err.message }); } });
router.get('/search', async (req, res) => { try { const { address, apn } = req.query; if (!address && !apn) return res.status(400).json({ error: 'address or apn is required' }); const results = apn ? await intelligence.searchByApn(apn) : await intelligence.searchByAddress(address); res.json({ ok: true, count: results.length, results }); } catch (err) { res.status(502).json({ ok: false, error: err.message }); } });
module.exports = router;
