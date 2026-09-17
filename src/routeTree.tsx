import { createRootRoute, createRoute } from '@tanstack/react-router'
import { RootLayout } from './routes/root'
import { DashboardPage } from './routes/dashboard'
import { Route as authRoute } from './routes/api/auth/$'

const rootRoute = createRootRoute({
  component: RootLayout,
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
})

export const routeTree = rootRoute.addChildren([dashboardRoute, authRoute])
