import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Pool } from 'pg'

let authInstance: ReturnType<typeof betterAuth> | undefined

export function getAuth() {
  if (authInstance) return authInstance

  const connectionString = process.env.DATABASE_URL
  const secret = process.env.BETTER_AUTH_SECRET
  if (!connectionString) throw new Error('DATABASE_URL is required for Better Auth')
  if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')

  const socialProviders: BetterAuthOptions['socialProviders'] = {}
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }
  }
  if (process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET) {
    socialProviders.twitter = {
      clientId: process.env.X_CLIENT_ID,
      clientSecret: process.env.X_CLIENT_SECRET,
    }
  }

  authInstance = betterAuth({
    secret,
    database: new Pool({ connectionString }),
    emailAndPassword: { enabled: true },
    socialProviders,
    plugins: [tanstackStartCookies()],
  })

  return authInstance
}
