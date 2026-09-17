import { createRootRoute, createRoute } from '@tanstack/react-router'
import { RootLayout } from './routes/root'
import { DashboardPage } from './routes/dashboard'
import { PropertiesPage } from './routes/properties'
import { OwnersPage } from './routes/owners'
import { ImportsPage } from './routes/imports'
import { Route as authRoute } from './routes/api/auth/$'
import { Route as loginRoute } from './routes/login'
import { Route as signupRoute } from './routes/signup'
const rootRoute=createRootRoute({component:RootLayout})
const dashboardRoute=createRoute({getParentRoute:()=>rootRoute,path:'/',component:DashboardPage})
const propertiesRoute=createRoute({getParentRoute:()=>rootRoute,path:'/properties',component:PropertiesPage})
const ownersRoute=createRoute({getParentRoute:()=>rootRoute,path:'/owners',component:OwnersPage})
const importsRoute=createRoute({getParentRoute:()=>rootRoute,path:'/imports',component:ImportsPage})
export const routeTree=rootRoute.addChildren([dashboardRoute,propertiesRoute,ownersRoute,importsRoute,loginRoute,signupRoute,authRoute])
