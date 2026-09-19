import React, { useEffect, useState } from 'react';

export default function Duplicates({ Panel }) {
  const [status, setStatus] = useState('review');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  async function load(nextStatus = status) {
    try {
      setError('');
      const response = await fetch(`/api/duplicates?status=${encodeURIComponent(nextStatus)}`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || 'Unable to load duplicate candidates');
      setItems(body.items || []);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [status]);

  async function resolve(id, nextStatus) {
    try {
      setBusy(id);
      setError('');
      const response = await fetch(`/api/duplicates/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || 'Unable to update duplicate candidate');
      setItems(current => current.filter(item => item.id !== id));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return <Panel title="Duplicate review">
    <div className="toolbar">
      <select value={status} onChange={e => setStatus(e.target.value)}>
        <option value="review">Needs review</option>
        <option value="accepted">Accepted</option>
        <option value="rejected">Rejected</option>
      </select>
      <button className="secondary" onClick={() => load()}>Refresh</button>
    </div>
    {error && <div className="error">{error}</div>}
    <div className="table-wrap"><table><thead><tr><th>Type</th><th>Record</th><th>Candidate</th><th>Match key</th><th>Confidence</th><th>Created</th>{status === 'review' && <th>Action</th>}</tr></thead><tbody>
      {items.map(item => <tr key={item.id}>
        <td>{item.entity_type}</td>
        <td>{item.entity_name || item.entity_id}</td>
        <td>{item.candidate_name || item.candidate_entity_id}</td>
        <td>{item.match_key}</td>
        <td>{item.confidence == null ? '—' : `${Math.round(Number(item.confidence) * 100)}%`}</td>
        <td>{new Date(item.created_at).toLocaleString()}</td>
        {status === 'review' && <td><button className="secondary small" disabled={busy === item.id} onClick={() => resolve(item.id, 'accepted')}>Accept</button>{' '}<button className="secondary small" disabled={busy === item.id} onClick={() => resolve(item.id, 'rejected')}>Reject</button></td>}
      </tr>)}
      {!items.length && <tr><td colSpan={status === 'review' ? 7 : 6}><div className="empty">No duplicate candidates in this state.</div></td></tr>}
    </tbody></table></div>
  </Panel>;
}
