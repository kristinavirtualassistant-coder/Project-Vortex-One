import { Outlet, Link } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '@/lib/query-client'
import '../styles.css'
const queryClient=createQueryClient()
const nav=[['/','Dashboard'],['/properties','Properties'],['/owners','Owners'],['/imports','Imports']]
export function RootLayout(){return <QueryClientProvider client={queryClient}><div className="min-h-screen bg-slate-50 text-slate-950"><header className="border-b bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4"><div><p className="text-sm font-semibold tracking-wide text-slate-500">VORTEX ONE</p><h1 className="text-lg font-semibold">Owner Intelligence Platform</h1></div><Link to="/login" className="rounded-lg border px-3 py-2 text-sm">Sign in</Link></div></header><div className="mx-auto flex max-w-7xl"><aside className="hidden w-52 shrink-0 border-r py-6 md:block"><nav className="space-y-1 pr-4">{nav.map(([to,label])=><Link key={to} to={to} className="block rounded-lg px-3 py-2 text-sm text-slate-700 [&.active]:bg-slate-100 [&.active]:font-semibold">{label}</Link>)}</nav></aside><main className="min-w-0 flex-1 px-6 py-8"><Outlet/></main></div></div></QueryClientProvider>}
