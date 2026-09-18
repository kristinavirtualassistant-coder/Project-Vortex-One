import type { ReactNode } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../lib/query-client'

import '../styles.css'

const queryClient = createQueryClient()

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Vortex One' },
    ],
  }),
  component: RootDocument,
})

function RootDocument() {
  return (
    <RootDocumentShell>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-slate-50 text-slate-950">
          <header className="border-b bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm font-semibold tracking-wide text-slate-500">VORTEX ONE</p>
                <h1 className="text-lg font-semibold">Owner Intelligence Platform</h1>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs text-slate-600">Foundation</span>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-8">
            <Outlet />
          </main>
        </div>
      </QueryClientProvider>
    </RootDocumentShell>
  )
}

function RootDocumentShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
