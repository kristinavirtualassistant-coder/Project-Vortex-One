# Vortex One Secret Register

This register records production secret names only. Secret values must never be committed to Git.

| Secret name | Purpose | Storage | Value committed? |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | Better Auth session/signing secret | Secret Manager / deployment environment | No |
| `JWT_SECRET` | JWT signing secret for application integrations | Secret Manager / deployment environment | No |
| `DATABASE_URL` | Production PostgreSQL connection string | Secret Manager / deployment environment | No |
| `RINGCENTRAL_JWT` | RingCentral telephony authentication credential | Secret Manager / deployment environment | No |
| `OPENAI_API_KEY` | OpenAI API authentication when AI provider functionality is enabled | Secret Manager / deployment environment | No |

CI uses ephemeral generated values for authentication tests. Production values must be provisioned outside source control.
