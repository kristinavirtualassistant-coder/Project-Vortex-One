const express = require('express');
const crypto = require('node:crypto');
const auth = require('../middleware/auth');
const db = require('../db');

const router = express.Router();
router.use(auth);

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function normalizeText(value) { return String(value ?? '').trim(); }
function normalizeKey(value) { return normalizeText(value).toLowerCase().replace(/\s+/g, ' ').trim(); }
function splitCsvLine(line) {
  const out = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { out.push(value); value = ''; }
    else value += ch;
  }
  out.push(value);
  return out;
}
function parseCsv(csv) {
  const lines = String(csv || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    const raw = {};
    headers.forEach((header, i) => { raw[header || `column_${i + 1}`] = values[i] ?? ''; });
    return { rowNumber: index + 2, raw };
  });
  return { headers, rows };
}
function pick(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && normalizeText(row[alias]) !== '') return normalizeText(row[alias]);
  }
  return null;
}
function normalizeRow(raw) {
  return {
    property_address: pick(raw, ['property_address','address','propertyaddress','site_address','situs_address']),
    city: pick(raw, ['city','property_city','situs_city']),
    state: pick(raw, ['state','property_state','situs_state']),
    zip: pick(raw, ['zip','zipcode','zip_code','property_zip','situs_zip']),
    county: pick(raw, ['county','property_county']),
    apn: pick(raw, ['apn','ain','parcel_number','parcel_id','assessor_parcel_number']),
    property_type: pick(raw, ['property_type','type','use_type','use']),
    units: pick(raw, ['units','unit_count','number_of_units']),
    beds: pick(raw, ['beds','bedrooms']),
    baths: pick(raw, ['baths','bathrooms']),
    sqft: pick(raw, ['sqft','square_feet','building_sqft','living_area']),
    lot_size_sqft: pick(raw, ['lot_size_sqft','lot_sqft','lot_size']),
    year_built: pick(raw, ['year_built','built_year']),
    zoning: pick(raw, ['zoning']),
    occupancy: pick(raw, ['occupancy','occupancy_status']),
    mailing_address: pick(raw, ['mailing_address','owner_mailing_address']),
    owner_name: pick(raw, ['owner_name','owner','property_owner','owner_full_name','name']),
    owner_phone: pick(raw, ['owner_phone','phone','phone_number','mobile']),
    owner_email: pick(raw, ['owner_email','email','email_address']),
  };
}
function intOrNull(value) { const n = Number(String(value || '').replace(/[^0-9.-]/g, '')); return Number.isInteger(n) ? n : null; }
function numOrNull(value) { const n = Number(String(value || '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; }

router.post('/preview', async (req, res) => {
  try {
    const csv = req.body?.csv;
    if (typeof csv !== 'string' || !csv.trim()) return res.status(400).json({ error: { code: 'CSV_REQUIRED', message: 'CSV text is required' } });
    const parsed = parseCsv(csv);
    const preview = parsed.rows.slice(0, 25).map(r => ({ rowNumber: r.rowNumber, normalized: normalizeRow(r.raw), raw: r.raw }));
    res.json({ headers: parsed.headers, totalRows: parsed.rows.length, preview });
  } catch (err) {
    res.status(400).json({ error: { code: 'CSV_PARSE_FAILED', message: err.message } });
  }
});

router.post('/csv', async (req, res) => {
  const csv = req.body?.csv;
  const filename = normalizeText(req.body?.filename) || 'upload.csv';
  if (typeof csv !== 'string' || !csv.trim()) return res.status(400).json({ error: { code: 'CSV_REQUIRED', message: 'CSV text is required' } });
  if (Buffer.byteLength(csv, 'utf8') > 20 * 1024 * 1024) return res.status(413).json({ error: { code: 'CSV_TOO_LARGE', message: 'CSV exceeds the 20 MB limit' } });

  const parsed = parseCsv(csv);
  if (!parsed.headers.length) return res.status(400).json({ error: { code: 'CSV_EMPTY', message: 'CSV contains no header row' } });
  if (!parsed.headers.some(h => ['property_address','address','apn','ain','owner_name','owner'].includes(h))) {
    return res.status(400).json({ error: { code: 'CSV_HEADERS_UNSUPPORTED', message: 'CSV must contain an address, APN/AIN, or owner name column' } });
  }

  const contentHash = crypto.createHash('sha256').update(csv).digest('hex');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const source = await client.query(`INSERT INTO data_sources(org_id,name,source_type) VALUES($1,$2,'csv') RETURNING id`, [req.user.orgId, filename]);
    const sourceId = source.rows[0].id;
    const imp = await client.query(`INSERT INTO imports(org_id,source_id,filename,content_hash,status,total_rows) VALUES($1,$2,$3,$4,'processing',$5) RETURNING id`, [req.user.orgId, sourceId, filename, contentHash, parsed.rows.length]);
    const importId = imp.rows[0].id;
    let validRows = 0, invalidRows = 0, importedRows = 0;
    const errors = [];

    for (const record of parsed.rows) {
      const normalized = normalizeRow(record.raw);
      const rowErrors = [];
      if (!normalized.property_address && !normalized.apn) rowErrors.push({ field: 'property_address', message: 'Property address or APN/AIN is required' });
      if (!normalized.owner_name) rowErrors.push({ field: 'owner_name', message: 'Owner name is required for owner relationship import' });
      const status = rowErrors.length ? 'invalid' : 'valid';
      if (rowErrors.length) { invalidRows += 1; errors.push({ row: record.rowNumber, errors: rowErrors }); }
      else validRows += 1;
      await client.query(`INSERT INTO import_records(import_id,row_number,raw_data,normalized_data,status,errors) VALUES($1,$2,$3,$4,$5,$6)`, [importId, record.rowNumber, record.raw, normalized, status, rowErrors]);
      if (rowErrors.length) continue;

      const propertyKey = normalized.apn ? normalizeKey(normalized.apn) : `${normalizeKey(normalized.property_address)}|${normalizeKey(normalized.zip || '')}`;
      let property = await client.query(`SELECT id FROM properties WHERE org_id=$1 AND ((apn IS NOT NULL AND LOWER(apn)=LOWER($2)) OR (LOWER(TRIM(address))=LOWER(TRIM($3)) AND COALESCE(zip,'')=COALESCE($4,''))) LIMIT 1`, [req.user.orgId, normalized.apn || '', normalized.property_address || '', normalized.zip || '']);
      let propertyId;
      if (property.rows.length) {
        propertyId = property.rows[0].id;
        await client.query(`UPDATE properties SET city=COALESCE($2,city),state=COALESCE($3,state),zip=COALESCE($4,zip),county=COALESCE($5,county),ain=COALESCE($6,ain),property_type=COALESCE($7,property_type),units=COALESCE($8,units),bedrooms=COALESCE($9,bedrooms),bathrooms=COALESCE($10,bathrooms),sqft=COALESCE($11,sqft),lot_size_sqft=COALESCE($12,lot_size_sqft),year_built=COALESCE($13,year_built),zoning=COALESCE($14,zoning),occupancy=COALESCE($15,occupancy),mailing_address=COALESCE($16,mailing_address) WHERE id=$1 AND org_id=$17`, [propertyId,normalized.city,normalized.state,normalized.zip,normalized.county,normalized.apn,normalized.property_type,intOrNull(normalized.units),intOrNull(normalized.beds),numOrNull(normalized.baths),intOrNull(normalized.sqft),intOrNull(normalized.lot_size_sqft),intOrNull(normalized.year_built),normalized.zoning,normalized.occupancy,normalized.mailing_address,req.user.orgId]);
      } else {
        property = await client.query(`INSERT INTO properties(org_id,address,city,state,zip,apn,ain,county,property_type,units,bedrooms,bathrooms,sqft,lot_size_sqft,year_built,zoning,occupancy,mailing_address,source_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`, [req.user.orgId,normalized.property_address || normalized.apn,normalized.city,normalized.state,normalized.zip,normalized.apn,normalized.apn,normalized.county,normalized.property_type,intOrNull(normalized.units),intOrNull(normalized.beds),numOrNull(normalized.baths),intOrNull(normalized.sqft),intOrNull(normalized.lot_size_sqft),intOrNull(normalized.year_built),normalized.zoning,normalized.occupancy,normalized.mailing_address,filename]);
        propertyId = property.rows[0].id;
      }

      const ownerKey = `${normalizeKey(normalized.owner_name)}|${normalizeKey(normalized.mailing_address || '')}`;
      let owner = await client.query(`SELECT id FROM owners WHERE org_id=$1 AND LOWER(TRIM(name))=LOWER(TRIM($2)) AND COALESCE(LOWER(TRIM(mailing_address)),'')=COALESCE(LOWER(TRIM($3)),'') LIMIT 1`, [req.user.orgId,normalized.owner_name,normalized.mailing_address || '']);
      let ownerId;
      if (owner.rows.length) ownerId = owner.rows[0].id;
      else {
        owner = await client.query(`INSERT INTO owners(org_id,name,phone,email,mailing_address) VALUES($1,$2,$3,$4,$5) RETURNING id`, [req.user.orgId,normalized.owner_name,normalized.owner_phone,normalized.owner_email,normalized.mailing_address]);
        ownerId = owner.rows[0].id;
      }
      await client.query(`INSERT INTO property_owners(property_id,owner_id,is_primary,source_id) VALUES($1,$2,true,$3) ON CONFLICT(property_id,owner_id) DO NOTHING`, [propertyId,ownerId,sourceId]);
      const fields = [['address', normalized.property_address],['apn',normalized.apn],['owner_name',normalized.owner_name],['owner_phone',normalized.owner_phone],['owner_email',normalized.owner_email]].filter(([,v]) => v);
      for (const [fieldName, sourceValue] of fields) await client.query(`INSERT INTO provenance(org_id,source_id,import_id,entity_type,entity_id,field_name,source_value,method) VALUES($1,$2,$3,$4,$5,$6,$7,'csv_import')`, [req.user.orgId,sourceId,importId,fieldName === 'owner_name' || fieldName.startsWith('owner_') ? 'owner' : 'property',fieldName === 'owner_name' || fieldName.startsWith('owner_') ? ownerId : propertyId,fieldName,sourceValue]);
      await client.query(`UPDATE import_records SET status='imported' WHERE import_id=$1 AND row_number=$2`, [importId,record.rowNumber]);
      importedRows += 1;
    }

    await client.query(`UPDATE imports SET status='completed',valid_rows=$2,invalid_rows=$3,imported_rows=$4,completed_at=NOW() WHERE id=$1`, [importId,validRows,invalidRows,importedRows]);
    await client.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'import.completed','import',$3,$4)`, [req.user.orgId,req.user.userId,importId,{filename,totalRows:parsed.rows.length,validRows,invalidRows,importedRows,contentHash}]);
    await client.query('COMMIT');
    res.status(201).json({ importId, filename, totalRows: parsed.rows.length, validRows, invalidRows, importedRows, errors: errors.slice(0, 100) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: { code: 'IMPORT_FAILED', message: 'CSV import failed' } });
  } finally { client.release(); }
});

router.get('/', async (req,res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const result = await db.query(`SELECT id,filename,status,total_rows,valid_rows,invalid_rows,imported_rows,created_at,completed_at FROM imports WHERE org_id=$1 ORDER BY created_at DESC LIMIT $2`, [req.user.orgId,limit]);
  res.json({ items: result.rows });
});

module.exports = router;
