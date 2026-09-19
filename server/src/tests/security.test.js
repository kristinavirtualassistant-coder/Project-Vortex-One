const assert = require('node:assert/strict');
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

(async () => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    const organization = await client.query("INSERT INTO organizations(name) VALUES('Security Test Organization') RETURNING id");
    const organizationId = organization.rows[0].id;
    const audit = await client.query(
      `INSERT INTO audit_logs(organization_id, action, entity_type, entity_id, details)
       VALUES($1, 'security.test', 'organization', $1, '{"source":"security.test"}') RETURNING id`,
      [organizationId]
    );
    const auditId = audit.rows[0].id;

    await client.query('SAVEPOINT audit_update_attempt');
    await assert.rejects(
      client.query('UPDATE audit_logs SET details=$2 WHERE id=$1', [auditId, { mutated: true }]),
      /audit_logs are append-only/
    );
    await client.query('ROLLBACK TO SAVEPOINT audit_update_attempt');
    await client.query('RELEASE SAVEPOINT audit_update_attempt');

    await client.query('SAVEPOINT audit_delete_attempt');
    await assert.rejects(
      client.query('DELETE FROM audit_logs WHERE id=$1', [auditId]),
      /audit_logs are append-only/
    );
    await client.query('ROLLBACK TO SAVEPOINT audit_delete_attempt');
    await client.query('RELEASE SAVEPOINT audit_delete_attempt');

    const preserved = await client.query('SELECT details FROM audit_logs WHERE id=$1', [auditId]);
    assert.deepEqual(preserved.rows[0].details, { source: 'security.test' });
    await client.query('ROLLBACK');
    console.log('Audit immutability checks passed.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
