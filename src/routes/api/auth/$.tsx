import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '../../../lib/auth'

function handleAuthRequest(request: Request) {
  const handler = getAuth().handler
  if (!handler) throw new Error('Better Auth handler is not configured')
  return handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => handleAuthRequest(request),
    },
  },
})
