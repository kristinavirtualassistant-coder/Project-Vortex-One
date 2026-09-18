const metrics = [
  ['Properties', '0'],
  ['Owners', '0'],
  ['Leads', '0'],
  ['Calls', '0'],
]

export function DashboardPage() {
  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-medium text-slate-500">Operations</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Your organization workspace is empty. Records appear only after authenticated import or user-created data.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <article key={label} className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold">{value}</p>
          </article>
        ))}
      </div>
      <div className="rounded-xl border border-dashed bg-white p-8 text-center">
        <h3 className="font-semibold">No operational records</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
          No properties, owners, contacts, leads, phone numbers, listings, or call history are seeded in the foundation.
        </p>
      </div>
    </section>
  )
}
