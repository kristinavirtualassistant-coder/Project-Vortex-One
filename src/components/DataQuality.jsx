import React, { useEffect, useState } from 'react';

export default function DataQuality({ Panel }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/data-quality/summary', { credentials: 'include' })
      .then(async r => { const body = await r.json().catch(() => ({})); if (!r.ok) throw new Error(body?.error?.message || 'Unable to load data quality'); return body; })
      .then(setData).catch(e => setError(e.message));
  }, []);
  if (error) return <Panel title="Data quality"><div className="error">{error}</div></Panel>;
  if (!data) return <Panel title="Data quality"><div className="empty"><h3>Loading data quality…</h3><p>Checking organization-scoped records.</p></div></Panel>;
  const labels = {
    properties_missing_identity: 'Properties missing address and APN/AIN',
    owners_missing_name: 'Owners missing name',
    contacts_without_channels: 'Contacts without phone or email',
    leads_with_invalid_property: 'Leads with invalid property reference',
    leads_with_invalid_owner: 'Leads with invalid owner reference',
    calls_with_invalid_lead: 'Calls with invalid lead reference',
    properties_without_provenance: 'Properties without provenance'
  };
  return <Panel title="Data quality"><div className="metric-grid"><div className="metric"><span>Total issues</span><strong>{data.issue_count}</strong><small>Live organization count</small></div></div><div className="table-wrap"><table><thead><tr><th>Check</th><th>Issues</th></tr></thead><tbody>{Object.entries(labels).map(([key,label]) => <tr key={key}><td>{label}</td><td>{Number(data.summary?.[key] || 0)}</td></tr>)}</tbody></table></div><p className="muted">Generated {new Date(data.generated_at).toLocaleString()} from live organization-scoped records.</p></Panel>;
}
