# Vortex One Production Deployment

## Runtime architecture

Vortex One is a Node/Express application that serves the built React/Vite frontend and the `/api/*` backend from the same origin. PostgreSQL is the production database.

The included `Dockerfile` is the canonical application runtime. `compose.production.yml` provides a complete self-hosted application + PostgreSQL stack for a Docker host.

Netlify is optional for a frontend-only deployment. A Netlify static site does not provide the Vortex One Node/Express runtime or PostgreSQL database, so it must not be treated as the complete production deployment.

## Required production environment

```env
NODE_ENV=production
PORT=8080
CLIENT_URL=https://<public-vortex-one-url>
BETTER_AUTH_SECRET=<32+ character random secret>
JWT_SECRET=<32+ character random secret>
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<dbname>?sslmode=require
```

`BETTER_AUTH_SECRET` and `JWT_SECRET` must each be at least 32 characters. `CLIENT_URL` must be an absolute URL. `DATABASE_URL` must point to a real PostgreSQL database.

## Optional RingCentral configuration

```env
DEFAULT_CALLER_ID=
RC_SERVER_URL=https://platform.ringcentral.com
RC_APP_CLIENT_ID=
RC_APP_CLIENT_SECRET=
RC_USER_JWT=
```

If RingCentral is not configured, the application does not simulate outbound calls; the call execution path remains unexecuted.

## Docker deployment

Build from the repository root using the included `Dockerfile`.

```bash
docker build -t vortex-one .
docker run --rm -p 8080:8080 --env-file .env vortex-one
```

For a self-hosted PostgreSQL stack:

```bash
docker compose -f compose.production.yml up -d --build
```

The application container waits for PostgreSQL health, runs `npm run db:migrate`, then starts the production server.

## Host configuration

For Render, Railway, Fly.io, or another Docker-capable host, deploy the repository root as a Docker service and provide the required environment variables in the host's secret/environment manager. Do not commit secret values to Git.

The service must expose port `8080` (or honor the host-provided `PORT` value), and its public URL must be used as `CLIENT_URL`.

## Verification gates

Before declaring a deployment ready, verify:

1. `npm run build`
2. `npm run db:migrate` against the target PostgreSQL database
3. `/api/health` returns database readiness
4. `/api/ready` reports no pending or unknown migrations
5. foundation, workflow, duplicate, contact, security, and smoke tests pass
6. browser smoke QA passes against the built application
7. authentication and organization isolation are verified
8. no production business records are seeded
9. secret/credential registers contain names only, never values
10. the deployed browser URL loads the application and authenticated API requests use the same production origin

## Security rules

Never commit `DATABASE_URL` values containing passwords, authentication secrets, JWTs, RingCentral tokens, API keys, or provider credentials. Record credential names and ownership/configuration requirements only in the repository's credential/secret registers.
