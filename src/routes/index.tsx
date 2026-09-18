import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from './dashboard'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})
