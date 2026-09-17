import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const getRouter = () =>
  createRouter({
    routeTree,
    context: {},
    defaultPreload: 'intent',
  })

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
