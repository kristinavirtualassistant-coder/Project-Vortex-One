require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function migrate() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);

    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      for (const file of fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
        await client.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
        console.log(`Applied ${file}`);
      }
    }

    await client.query('COMMIT');
    console.log('Vortex One database schema applied.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await db.pool.end();
  }
}

migrate().catch(err => {
  console.error(err.message);
  process.exit(1);
});
