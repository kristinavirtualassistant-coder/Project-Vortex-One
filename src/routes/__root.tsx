import type { ReactNode } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { RootLayout } from './-root'

import '../styles.css'

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
      <RootLayout>
        <Outlet />
      </RootLayout>
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
