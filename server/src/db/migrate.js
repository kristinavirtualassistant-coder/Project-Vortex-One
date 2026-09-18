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

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      for (const file of fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
        const applied = await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [file]);
        if (applied.rows.length) continue;
        await client.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [file]);
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
