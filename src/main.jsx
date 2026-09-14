import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const api = async (path, options = {}) => {
  const token = localStorage.getItem('vortexToken');
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
};

function PropertySearch() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('address');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search(e) {
    e.preventDefault();
    setLoading(true); setError(''); setResults([]); setStatus(null);
    try {
      const data = await api(`/api/property/search?${mode}=${encodeURIComponent(query.trim())}`);
      setResults(data.results || []);
      if (!data.results?.length) setStatus('No parcel records matched this search.');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return <section className="property-search">
    <div className="section-head"><div><h2>Property Intelligence</h2><p>Live parcel records from public government GIS sources. No demo records.</p></div></div>
    <form className="searchbar" onSubmit={search}>
      <select value={mode} onChange={e => setMode(e.target.value)} aria-label="Search type"><option value="address">Address</option><option value="apn">APN / AIN</option></select>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={mode === 'address' ? 'Example: 333 W Ocean Blvd, Long Beach, CA' : 'Enter APN or AIN'} required />
      <button disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
    </form>
    {error && <div className="error">{error}</div>}
    {status && !error && <div className="notice">{status}</div>}
    <div className="results">
      {results.map((p, i) => <article className="property-card" key={`${p.apn || p.ain || p.address}-${i}`}>
        <div className="property-title"><h3>{p.address || 'Parcel record'}</h3><span>{p.city || ''} {p.zip || ''}</span></div>
        <div className="property-grid">
          <div><label>APN</label><strong>{p.apn || p.ain || '—'}</strong></div>
          <div><label>Use</label><strong>{p.use_description || p.use_type || '—'}</strong></div>
          <div><label>Year Built</label><strong>{p.year_built || '—'}</strong></div>
          <div><label>Units</label><strong>{p.units ?? '—'}</strong></div>
          <div><label>Bedrooms</label><strong>{p.bedrooms ?? '—'}</strong></div>
          <div><label>Bathrooms</label><strong>{p.bathrooms ?? '—'}</strong></div>
          <div><label>Sq Ft</label><strong>{p.sqft ?? '—'}</strong></div>
          <div><label>Land Value</label><strong>{p.land_value ?? '—'}</strong></div>
        </div>
        <div className="provenance">Source: {p.source || 'Government GIS'} {p.source_url ? <a href={p.source_url} target="_blank" rel="noreferrer">source record</a> : null}</div>
      </article>)}
    </div>
  </section>;
}

function App() {
  const [user, setUser] = useState(localStorage.getItem('vortexUser'));
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  async function login(e) {
    e.preventDefault(); setError('');
    try {
      const r = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password}) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Login failed');
      localStorage.setItem('vortexToken', d.token); localStorage.setItem('vortexUser', JSON.stringify(d.user)); setUser(JSON.stringify(d.user));
    } catch (err) { setError(err.message); }
  }
  if (!user) return <div className="auth"><div className="card"><b>VORTEX ONE</b><h1>Sign in</h1><form onSubmit={login}><input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required/><button>Sign in</button></form>{error && <p className="error">{error}</p>}</div></div>;
  const u = JSON.parse(user);
  return <div className="app"><aside><b>VORTEX ONE</b><nav><a className="active">Property Search</a><a>Dashboard</a><a>Dialer</a><a>Leads</a><a>Campaigns</a><a>Reports</a><a>Settings</a></nav><button onClick={()=>{localStorage.clear();setUser(null)}}>Sign out</button></aside><main><div className="topline"><div><h1>Property Search</h1><p>Signed in as {u.name || u.email}</p></div></div><PropertySearch/></main></div>;
}

createRoot(document.getElementById('root')).render(<App />);
