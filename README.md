# Vortex One

Real full-stack owner intelligence, CRM, lead operations, campaigns, dialer workflow, imports, reporting, and organization administration platform.

## Current implementation

- Better Auth email/password authentication with organization membership resolution.
- Organization-scoped properties, owners, leads, contacts, tasks, campaigns, dialer sessions/calls, imports, audit activity, reports, and data-quality checks.
- PostgreSQL migrations with applied-migration tracking and cross-organization integrity constraints.
- Import validation, duplicate detection, source hashing, and provenance records.
- Role controls for owner, admin, manager, rep, and viewer.
- Security headers, CORS origin allow-list, protected API routes, and no business-record seed data.
- Real RingCentral RingOut adapter using server-side JWT authentication when RingCentral credentials are configured; otherwise calls remain explicitly unexecuted rather than simulated.
- Production build and CI checks use PostgreSQL 16 and Node 24.

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ characters), and `JWT_SECRET` (32+ characters).
3. Run `npm install`.
4. Run `npm run db:migrate`.
5. Run `npm run dev`.

For production: `npm run build` then `npm start`.

### RingCentral calling

To enable real outbound RingOut execution, configure `RC_SERVER_URL` (normally `https://platform.ringcentral.com`), `RC_APP_CLIENT_ID`, `RC_APP_CLIENT_SECRET`, and `RC_USER_JWT` in the deployment secret/environment manager. `DEFAULT_CALLER_ID` is optional; when omitted, RingCentral can use the extension's configured default caller ID. The application never stores those secret values in source control. The dialer exposes provider-status synchronization for an individual RingOut call.

## Data policy

The repository does not seed fake/sample property, owner, lead, contact, call, or campaign records. Catalog/configuration rows may be created by migrations; operational data must come from authorized users or source imports.

## Security

Never commit credentials, API keys, passwords, JWTs, database URLs containing passwords, or provider secrets. See `docs/credential-register.csv` and `docs/secret-register.md` for the names and purposes of required secrets without secret values.
