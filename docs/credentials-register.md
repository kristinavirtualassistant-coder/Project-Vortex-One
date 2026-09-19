# Vortex One Credential Register

This file records credential **names and ownership/configuration requirements only**. Never store secret values, access tokens, passwords, private keys, or JWT values in Git.

| Secret / credential name | Purpose | Required environment | Value storage |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | Better Auth session/signing secret | Production | Secret manager / deployment environment |
| `JWT_SECRET` | Socket/API JWT signing secret | Production | Secret manager / deployment environment |
| `DATABASE_URL` | PostgreSQL connection string | Production | Secret manager / deployment environment |
| `RC_APP_CLIENT_ID` | RingCentral application client ID | Production when telephony enabled | Secret manager / deployment environment |
| `RC_APP_CLIENT_SECRET` | RingCentral application client secret | Production when telephony enabled | Secret manager / deployment environment |
| `RC_USER_JWT` | RingCentral JWT credential | Production when telephony enabled | Secret manager / deployment environment |
| `DEFAULT_CALLER_ID` | Organization-approved outbound caller ID | Production when telephony enabled | Deployment configuration / secret manager as appropriate |

## Rotation / incident rule

If any real credential is exposed in source control, revoke/rotate it immediately and replace the repository value with an environment reference. This register must remain value-free.
