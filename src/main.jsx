import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const api = async (path, options = {}) => {
  const token = localStorage.getItem('vortexToken');
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.error || 'Request failed');
  return data;
};

const nav = ['Dashboard','Properties','Owners','Leads','Contacts','Campaigns','Dialer','Tasks','Activity','Imports','Reports','Data Quality','Settings','Admin'];

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const data = await api('/api/auth/login', { method:'POST', body:JSON.stringify({ email, password }) });
      localStorage.setItem('vortexToken', data.token);
      localStorage.setItem('vortexUser', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="login-page"><div className="login-card">
    <div className="brand">VORTEX ONE</div><div className="eyebrow">OWNER INTELLIGENCE PLATFORM</div>
    <h1>Sign in</h1><p className="muted">Use an authorized organization account.</p>
    <form onSubmit={submit} className="stack">
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required /></label>
      <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required /></label>
      {error && <div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </div></div>;
}

function Dashboard({ user }) {
  const [counts, setCounts] = useState(null); const [error, setError] = useState('');
  useEffect(()=>{ api('/api/foundation/dashboard').then(d=>setCounts(d.counts)).catch(e=>setError(e.message)); },[]);
  const cards = [['Properties','properties'],['Owners','owners'],['Leads','leads'],['Calls','calls'],['Active members','members']];
  return <Page title="Dashboard" subtitle="Organization operations at a glance">
    {error && <div className="error">{error}</div>}
    <div className="metric-grid">{cards.map(([label,key])=><div className="metric" key={key}><span>{label}</span><strong>{counts ? counts[key] : '—'}</strong><small>Live database count</small></div>)}</div>
    <div className="panel empty-panel"><div className="empty-icon">0</div><h2>No operational records yet</h2><p>Vortex One does not create sample properties, owners, contacts, leads, phone numbers, listings, or call history.</p><p>Records will appear after an authorized import or user action.</p></div>
  </Page>;
}

function Members() {
  const [items,setItems]=useState([]); const [error,setError]=useState('');
  const load=()=>api('/api/foundation/members').then(d=>setItems(d.items)).catch(e=>setError(e.message));
  useEffect(load,[]);
  return <Page title="Admin · Members" subtitle="Organization membership and roles">
    {error && <div className="error">{error}</div>}
    <div className="panel"><div className="panel-head"><div><h2>Members</h2><p>Only organization administrators can manage membership.</p></div></div>
      {items.length===0?<Empty title="No members found" text="The signed-in organization has no active membership records."/>:<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.email}</td><td><span className="pill">{x.role}</span></td><td>{x.status}</td></tr>)}</tbody></table>}
    </div>
  </Page>;
}

function Settings() {
  const [data,setData]=useState(null); const [error,setError]=useState('');
  useEffect(()=>{api('/api/foundation/settings').then(setData).catch(e=>setError(e.message));},[]);
  return <Page title="Settings" subtitle="Organization system settings"><div className="panel"><h2>System settings</h2><p className="muted">Foundation settings are organization-scoped and stored server-side.</p>{error?<div className="error">{error}</div>:<pre className="json">{JSON.stringify(data?.settings || {},null,2)}</pre>}</div></Page>;
}

function Placeholder({ title }) { return <Page title={title} subtitle="Foundation navigation is ready"><div className="panel"><Empty title="Not available yet" text="This module is intentionally empty in M1. No fake records are displayed."/></div></Page>; }
function Empty({title,text}) { return <div className="empty"><h3>{title}</h3><p>{text}</p></div>; }
function Page({title,subtitle,children}) { return <section className="page"><div className="page-head"><div><div className="eyebrow">VORTEX ONE</div><h1>{title}</h1><p>{subtitle}</p></div><div className="status-dot">SYSTEM READY</div></div>{children}</section>; }

function App() {
  const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem('vortexUser'))}catch{return null}});
  const [active,setActive]=useState('Dashboard');
  if(!user) return <Login onLogin={setUser}/>;
  const content = active==='Dashboard'?<Dashboard user={user}/>:active==='Admin'?<Members/>:active==='Settings'?<Settings/>:<Placeholder title={active}/>;
  return <div className="app"><aside className="sidebar"><div className="brand">VORTEX ONE</div><div className="org">{user.org_id ? 'Organization' : 'Organization'}<strong>{user.name || user.email}</strong></div><nav>{nav.map(item=><button key={item} className={active===item?'active':''} onClick={()=>setActive(item)}>{item}</button>)}</nav><button className="signout" onClick={()=>{localStorage.clear();setUser(null)}}>Sign out</button></aside><main>{content}</main></div>;
}

createRoot(document.getElementById('root')).render(<App/>);
