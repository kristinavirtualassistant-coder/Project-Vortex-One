# Vortex One Secret Register

This register records secret names required by the application. Secret values are intentionally never stored in Git.

| Name | Purpose | Required | Storage location | Value stored here |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | Yes | Deployment secret/environment manager | No |
| `BETTER_AUTH_SECRET` | Better Auth session/signing secret | Yes; minimum 32 characters | Deployment secret/environment manager | No |
| `JWT_SECRET` | Socket authentication signing secret | Yes for Socket.IO JWT authentication | Deployment secret/environment manager | No |
| `DEFAULT_CALLER_ID` | Optional telephony caller ID | No | Deployment environment manager | No |

## CI-generated credentials

CI creates ephemeral test-only values for `BETTER_AUTH_SECRET` and `JWT_SECRET` at runtime. The values are masked and are not persisted in source control.

## Production provider credentials

No production telephony/API provider credentials were created by this implementation pass. The dialer therefore records calls as real application records but does not claim to execute an external call until a provider is explicitly configured in the deployment environment.

## Rules

- Never commit secret values, passwords, API keys, JWTs, database credentials, or provider credentials.
- Use the deployment platform's secret manager/environment configuration for production values.
- Rotate any credential that has been exposed outside an approved secret manager.
- CI uses ephemeral test-only values and does not reuse production credentials.
