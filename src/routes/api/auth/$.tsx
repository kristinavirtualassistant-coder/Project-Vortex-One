import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '@/lib/auth'

// Better Auth handler is mounted on the canonical TanStack API route.
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => getAuth().handler(request),
      POST: ({ request }) => getAuth().handler(request),
    },
  },
})
