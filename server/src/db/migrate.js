require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Vortex One database schema applied.');
  await db.pool.end();
}

migrate().catch(async (err) => {
  console.error(err.message);
  await db.pool.end();
  process.exit(1);
});
