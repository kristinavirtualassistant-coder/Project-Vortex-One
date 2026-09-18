import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../lib/query-client'

const queryClient = createQueryClient()

export function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
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
          {children}
        </main>
      </div>
    </QueryClientProvider>
  )
}