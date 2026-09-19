import React, { useEffect, useState } from 'react';

export default function Reports({ Panel, DataTable }) {
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/reports/overview', { credentials: 'include' }).then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error?.message || 'Unable to load reports');
        return body;
      }),
      fetch('/api/reports/activity?days=30', { credentials: 'include' }).then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error?.message || 'Unable to load activity report');
        return body;
      })
    ]).then(([overview, activityReport]) => {
      setData(overview);
      setActivity(activityReport.items || []);
    }).catch(e => setError(e.message));
  }, []);

  if (error) return <Panel title="Reports"><div className="error">{error}</div></Panel>;
  if (!data) return <Panel title="Reports"><div className="empty"><h3>Loading reports…</h3><p>Reading organization-scoped live data.</p></div></Panel>;

  const totals = data.totals || {};
  return <>
    <Panel title="Operational overview">
      <div className="metric-grid">
        {[
          ['Properties', totals.properties],
          ['Owners', totals.owners],
          ['Leads', totals.leads],
          ['Contacts', totals.contacts],
          ['Calls', totals.calls],
          ['Open tasks', totals.open_tasks]
        ].map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value ?? 0}</strong><small>Live organization count</small></div>)}
      </div>
    </Panel>
    <div className="grid-two">
      <Panel title="Lead status">
        <DataTable columns={['Status', 'Count']} rows={data.lead_status} render={(x, i) => <tr key={i}><td>{x.status}</td><td>{x.count}</td></tr>} />
      </Panel>
      <Panel title="Call disposition">
        <DataTable columns={['Disposition', 'Count']} rows={data.call_disposition} render={(x, i) => <tr key={i}><td>{x.disposition}</td><td>{x.count}</td></tr>} />
      </Panel>
    </div>
    <div className="grid-two">
      <Panel title="Property type">
        <DataTable columns={['Property type', 'Count']} rows={data.property_type} render={(x, i) => <tr key={i}><td>{x.property_type}</td><td>{x.count}</td></tr>} />
      </Panel>
      <Panel title="Audit activity — last 30 days">
        <DataTable columns={['Date', 'Events', 'Calls', 'Tasks', 'Imports']} rows={activity} render={(x, i) => <tr key={i}><td>{x.date}</td><td>{x.events}</td><td>{x.calls}</td><td>{x.tasks}</td><td>{x.imports}</td></tr>} />
      </Panel>
    </div>
    <p className="muted">Generated {new Date(data.generated_at).toLocaleString()} from live organization-scoped records. No sample business records are generated.</p>
  </>;
}
