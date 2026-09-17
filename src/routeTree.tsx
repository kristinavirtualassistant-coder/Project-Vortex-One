import { Route as rootRoute } from './routes/__root'
import { Route as dashboardRoute } from './routes/dashboard'
import { Route as propertiesRoute } from './routes/properties'
import { Route as ownersRoute } from './routes/owners'
import { Route as importsRoute } from './routes/imports'
import { Route as authRoute } from './routes/api/auth/$'
import { Route as loginRoute } from './routes/login'
import { Route as signupRoute } from './routes/signup'

export const routeTree=rootRoute.addChildren([dashboardRoute,propertiesRoute,ownersRoute,importsRoute,loginRoute,signupRoute,authRoute])
