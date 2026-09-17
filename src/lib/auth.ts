import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required for Better Auth')
}

const socialProviders = {
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
  ...(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET
    ? {
        twitter: {
          clientId: process.env.X_CLIENT_ID,
          clientSecret: process.env.X_CLIENT_SECRET,
        },
      }
    : {}),
}

export const auth = betterAuth({
  database: new Pool({ connectionString }),
  emailAndPassword: { enabled: true },
  socialProviders,
  plugins: [tanstackStartCookies()],
})
