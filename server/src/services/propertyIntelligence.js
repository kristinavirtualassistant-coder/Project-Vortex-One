const https = require('https');

const LA_COUNTY_LAYER = 'https://cache.gis.lacounty.gov/cache/rest/services/LACounty_Cache/LACounty_Parcel/FeatureServer/0';
const LONG_BEACH_LAYER = 'https://services6.arcgis.com/yCArG7wGXGyWLqav/ArcGIS/rest/services/Assessor_Parcels/FeatureServer/0';
const REQUEST_TIMEOUT_MS = Math.min(Math.max(Number(process.env.PROPERTY_SOURCE_TIMEOUT_MS) || 8000, 1000), 30000);

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Vortex-One/1.0', Accept: 'application/json' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 10 * 1024 * 1024) request.destroy(new Error('Property source response exceeded the 10 MB limit'));
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Property source returned HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Property source returned invalid JSON')); }
      });
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('Property source request timed out')));
    request.on('error', reject);
  });
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function buildQuery(params) {
  return `${LA_COUNTY_LAYER}/query?${new URLSearchParams(params).toString()}`;
}

function normalizeFeature(feature) {
  const a = feature?.attributes || {};
  return {
    apn: a.APN || a.AIN || null,
    ain: a.AIN || null,
    address: a.SitusFullAddress || a.SitusAddress || null,
    city: a.SitusCity || null,
    zip: a.SitusZIP || null,
    use_type: a.UseType || null,
    use_description: a.UseDescription || null,
    design_type: a.DesignType1 || null,
    year_built: a.YearBuilt1 ?? null,
    units: a.Units1 ?? null,
    bedrooms: a.Bedrooms1 ?? null,
    bathrooms: a.Bathrooms1 ?? null,
    sqft: a.SQFTmain1 ?? null,
    land_value: a.Roll_LandValue ?? null,
    improvement_value: a.Roll_ImpValue ?? null,
    parcel_type: a.ParcelTypeCode || null,
    legal_description: a.LegalDescription || null,
    latitude: a.CENTER_LAT ?? null,
    longitude: a.CENTER_LON ?? null,
    source: 'Los Angeles County Assessor parcel GIS',
    source_url: LA_COUNTY_LAYER
  };
}

async function searchByAddress(address) {
  const clean = String(address || '').trim();
  if (!clean) throw new Error('address is required');
  if (clean.length > 300) throw new Error('address is too long');
  const where = `SitusFullAddress LIKE '%${escapeSql(clean)}%'`;
  const data = await getJson(buildQuery({ where, outFields: '*', returnGeometry: 'false', resultRecordCount: '25', f: 'json' }));
  if (data.error) throw new Error(data.error.message || 'Property source query failed');
  return (data.features || []).map(normalizeFeature);
}

async function searchByApn(apn) {
  const clean = String(apn || '').trim();
  if (!clean) throw new Error('apn is required');
  if (clean.length > 100) throw new Error('apn is too long');
  const where = `(APN='${escapeSql(clean)}' OR AIN='${escapeSql(clean)}')`;
  const data = await getJson(buildQuery({ where, outFields: '*', returnGeometry: 'false', resultRecordCount: '10', f: 'json' }));
  if (data.error) throw new Error(data.error.message || 'Property source query failed');
  return (data.features || []).map(normalizeFeature);
}

async function sourceStatus() {
  const [laResult, longBeachResult] = await Promise.allSettled([
    getJson(`${LA_COUNTY_LAYER}?f=json`),
    getJson(`${LONG_BEACH_LAYER}?f=json`)
  ]);
  const la = laResult.status === 'fulfilled' ? laResult.value : null;
  const longBeach = longBeachResult.status === 'fulfilled' ? longBeachResult.value : null;
  return [
    { provider: 'los_angeles_county_assessor_gis', name: 'Los Angeles County Assessor parcel GIS', status: la?.name ? 'reachable' : 'unavailable', layer: la?.name || 'LACounty Parcel', source_url: LA_COUNTY_LAYER, last_edit_date: la?.editingInfo?.lastEditDate || null },
    { provider: 'city_of_long_beach_assessor_parcels', name: 'City of Long Beach Assessor Parcels', status: longBeach?.name ? 'reachable' : 'unavailable', layer: longBeach?.name || 'Assessor Parcels', source_url: LONG_BEACH_LAYER, last_edit_date: longBeach?.editingInfo?.lastEditDate || null }
  ];
}

module.exports = { searchByAddress, searchByApn, sourceStatus, normalizeFeature };