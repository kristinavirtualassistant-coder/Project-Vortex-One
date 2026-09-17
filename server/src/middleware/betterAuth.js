const db = require('../db');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

let authInstance;
let authPool;

async function getBetterAuth() {
  if (authInstance) return authInstance;
  const { betterAuth } = await import('better-auth');
  const connectionString = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET must be at least 32 characters');
  const { Pool } = require('pg');
  authPool = new Pool({ connectionString });
  authInstance = betterAuth({ database: authPool, secret, emailAndPassword: { enabled: true } });
  return authInstance;
}

async function resolveLegacyMembership(sessionUser) {
  const existing = await db.query(`SELECT u.id,u.org_id,u.role,u.email,u.name FROM users u WHERE LOWER(u.email)=LOWER($1) LIMIT 1`, [sessionUser.email]);
  if (existing.rows.length) return existing.rows[0];

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const organization = await client.query(`INSERT INTO organizations(name) VALUES($1) RETURNING id`, [`${sessionUser.name || sessionUser.email}'s Organization`]);
    const orgId = organization.rows[0].id;
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const user = await client.query(`INSERT INTO users(org_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'owner') RETURNING id,org_id,role,email,name`, [orgId, sessionUser.name || sessionUser.email, sessionUser.email.toLowerCase(), passwordHash]);
    await client.query(`INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'owner')`, [orgId,user.rows[0].id]);
    await client.query(`INSERT INTO system_settings(organization_id) VALUES($1) ON CONFLICT (organization_id) DO NOTHING`, [orgId]);
    await client.query(`INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'organization.created','organization',$1,$3)`, [orgId,user.rows[0].id,{source:'better_auth_first_login'}]);
    await client.query('COMMIT');
    return user.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = async function betterAuthMiddleware(req,res,next) {
  try {
    const auth = await getBetterAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers) });
    if (!session?.user) return res.status(401).json({ error:{code:'UNAUTHENTICATED',message:'Authentication required'} });
    const user = await resolveLegacyMembership(session.user);
    req.user = { userId:user.id, orgId:user.org_id, role:user.role, email:user.email, name:user.name, authUserId:session.user.id };
    req.authSession = session;
    next();
  } catch (error) {
    console.error(error);
    res.status(401).json({ error:{code:'UNAUTHENTICATED',message:'Authentication required'} });
  }
};
