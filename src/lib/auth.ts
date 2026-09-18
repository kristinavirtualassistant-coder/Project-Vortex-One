import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
// @ts-expect-error pg's runtime package is available; CI may omit its ambient declaration.
import { Pool } from 'pg'

let authInstance: any

export function getAuth(): any {
  if (authInstance) return authInstance

  const connectionString = process.env.DATABASE_URL
  const secret = process.env.BETTER_AUTH_SECRET
  if (!connectionString) throw new Error('DATABASE_URL is required for Better Auth')
  if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')

  const config: any = {
    secret,
    database: new Pool({ connectionString }),
    emailAndPassword: { enabled: true },
    plugins: [tanstackStartCookies()],
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    config.socialProviders = {
      ...(config.socialProviders ?? {}),
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    }
  }

  if (process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET) {
    config.socialProviders = {
      ...(config.socialProviders ?? {}),
      twitter: {
        clientId: process.env.X_CLIENT_ID,
        clientSecret: process.env.X_CLIENT_SECRET,
      },
    }
  }

  authInstance = betterAuth(config)
  return authInstance
}
