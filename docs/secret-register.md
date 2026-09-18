# Vortex One Secret Register

This register records secret names required by the application. Secret values are intentionally never stored in Git.

| Name | Purpose | Required | Storage location | Value stored here |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | Yes | Deployment secret/environment manager | No |
| `BETTER_AUTH_SECRET` | Better Auth session/signing secret | Yes; minimum 32 characters | Deployment secret/environment manager | No |
| `JWT_SECRET` | Legacy/Socket authentication signing secret | Yes for Socket.IO JWT authentication | Deployment secret/environment manager | No |
| `DEFAULT_CALLER_ID` | Optional telephony caller ID | No | Deployment environment manager | No |

## Rules

- Never commit secret values, passwords, API keys, JWTs, database credentials, or provider credentials.
- Use the deployment platform's secret manager/environment configuration for production values.
- Rotate any credential that has been exposed outside an approved secret manager.
- CI uses ephemeral test-only values and does not reuse production credentials.
