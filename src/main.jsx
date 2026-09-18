import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const nav = [
  ['Dashboard', 'dashboard'], ['Properties', 'properties'], ['Owners', 'owners'], ['Leads', 'leads'],
  ['Tasks', 'tasks'], ['Imports', 'imports'], ['Activity', 'activity'], ['Settings', 'settings'], ['Admin', 'admin']
];
const pendingModules = ['Contacts', 'Campaigns', 'Dialer', 'Reports', 'Data Quality'];

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || data?.error || 'Request failed');
  return data;
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organization, setOrganization] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const endpoint = mode === 'login' ? '/api/auth/sign-in/email' : '/api/auth/sign-up/email';
      const body = mode === 'login' ? { email, password } : { name, email, password };
      const result = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
      if (result.error) throw new Error(result.error.message || 'Authentication failed');
      if (mode === 'signup' && organization.trim()) {
        // Organization creation is derived from the first authenticated account by the server.
        // The organization field is retained in the UI only as a future configuration input.
      }
      const session = await api('/api/auth/get-session');
      if (!session?.user) throw new Error('Authentication succeeded but no session was created');
      onAuthenticated(session.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="login-page"><div className="login-card">
    <div className="brand">VORTEX ONE</div><div className="eyebrow">OWNER INTELLIGENCE PLATFORM</div>
    <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
    <p className="muted">Authentication is handled by the application session service.</p>
    <form onSubmit={submit} className="stack">
      {mode === 'signup' && <>
        <label>Name<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required /></label>
        <label>Organization name<input value={organization} onChange={e=>setOrganization(e.target.value)} autoComplete="organization" placeholder="Optional for now" /></label>
      </>}
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required /></label>
      <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} minLength={8} required /></label>
      {error && <div className="error">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
    </form>
    <button className="link-button" onClick={()=>{setMode(mode==='login'?'signup':'login');setError('')}}>{mode==='login'?'Create an account':'Back to sign in'}</button>
  </div></div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [active, setActive] = useState('dashboard');

  useEffect(() => {
    api('/api/auth/get-session').then(data => setUser(data?.user || null)).catch(() => setUser(null)).finally(() => setChecking(false));
  }, []);

  async function signOut() {
    await api('/api/auth/sign-out', { method: 'POST' }).catch(() => {});
    setUser(null);
  }
  if (checking) return <div className="loading-page">Loading Vortex One…</div>;
  if (!user) return <AuthScreen onAuthenticated={setUser}/>;
  const selected = nav.find(x=>x[1]===active)?.[0] || active;
  return <div className="app">
    <aside className="sidebar">
      <div className="brand">VORTEX ONE</div>
      <div className="org"><span>Signed in</span><strong>{user.name || user.email}</strong><small>{user.email}</small></div>
      <nav>{nav.map(([label,key])=><button key={key} className={active===key?'active':''} onClick={()=>setActive(key)}>{label}</button>)}</nav>
      <div className="sidebar-footer"><button className="signout" onClick={signOut}>Sign out</button></div>
    </aside>
    <main><Page title={selected} user={user} active={active} onNavigate={setActive}/></main>
  </div>;
}

function Page({ title, user, active, onNavigate }) {
  const content = {
    dashboard: <Dashboard onNavigate={onNavigate}/>,
    properties: <Properties/>, owners: <Owners/>, leads: <Leads/>, tasks: <Tasks/>, imports: <Imports/>,
    activity: <Activity/>, settings: <Settings/>, admin: <Admin/>
  }[active] || <Pending title={title}/>;
  return <section className="page"><div className="page-head"><div><div className="eyebrow">VORTEX ONE</div><h1>{title}</h1><p>Organization-scoped operational workspace</p></div><div className="status-dot">LIVE DATA</div></div>{content}</section>;
}

function Dashboard({ onNavigate }) {
  const [data,setData]=useState(null), [error,setError]=useState('');
  useEffect(()=>{api('/api/foundation/dashboard').then(setData).catch(e=>setError(e.message))},[]);
  const cards=[['Properties','properties','properties'],['Owners','owners','owners'],['Leads','leads','leads'],['Calls','calls','dialer'],['Active members','members','admin']];
  return <>
    {error&&<div className="error">{error}</div>}
    <div className="metric-grid">{cards.map(([label,key,target])=><button className="metric" key={key} onClick={()=>onNavigate(target)}><span>{label}</span><strong>{data?.counts?.[key] ?? '—'}</strong><small>Live database count</small></button>)}</div>
    <div className="grid-two"><Panel title="Operational scope"><p>This workspace reads and writes organization-scoped records. No sample business records are generated.</p><p>Use <button className="inline-link" onClick={()=>onNavigate('imports')}>Imports</button> for authorized source data or create records through the supported modules.</p></Panel><Panel title="Modules"><div className="module-list">{pendingModules.map(x=><span className="pill muted-pill" key={x}>{x} · backend pending</span>)}</div></Panel></div>
  </>;
}

function Properties() {
  const [filters,setFilters]=useState({q:'',city:'',state:'',county:'',zip:'',apn:'',propertyType:'',minUnits:'',maxUnits:''});
  const [data,setData]=useState({items:[],total:0}); const [selected,setSelected]=useState(null); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  async function search(){setBusy(true);setError('');try{const q=new URLSearchParams(Object.entries(filters).filter(([,v])=>v));const result=await api('/api/property/search?'+q);setData(result)}catch(e){setError(e.message)}finally{setBusy(false)}}
  useEffect(()=>{search()},[]);
  return <>
    <Panel title="Property intelligence search"><div className="filter-grid">{[['q','Address, city, APN, owner'],['city','City'],['state','State'],['county','County'],['zip','ZIP'],['apn','APN / AIN'],['propertyType','Property type'],['minUnits','Min units'],['maxUnits','Max units']].map(([k,p])=><input key={k} placeholder={p} value={filters[k]} onChange={e=>setFilters({...filters,[k]:e.target.value})}/>)}</div><button className="primary small" onClick={search} disabled={busy}>{busy?'Searching…':'Search'}</button></Panel>
    {error&&<div className="error">{error}</div>}
    <Panel title={`${data.total} matching properties`}><DataTable columns={['Address','City','State','APN','Units','Owner']} rows={data.items} render={(x)=><tr key={x.id} onClick={()=>api('/api/property/'+x.id).then(setSelected).catch(e=>setError(e.message))}><td>{x.address}</td><td>{x.city||'—'}</td><td>{x.state||'—'}</td><td>{x.apn||x.ain||'—'}</td><td>{x.units??'—'}</td><td>{x.owners?.map(o=>o.name).join(', ')||'—'}</td></tr>}/></Panel>
    {selected&&<Detail title={selected.property.address} onClose={()=>setSelected(null)}><KeyValues data={{APN:selected.property.apn||selected.property.ain,Type:selected.property.property_type,Units:selected.property.units,Beds:selected.property.bedrooms,Baths:selected.property.bathrooms,Sqft:selected.property.sqft,Year:selected.property.year_built,Zoning:selected.property.zoning}}/><h3>Owners</h3><DataTable columns={['Name','Phone','Email','Ownership']} rows={selected.owners} render={(o)=><tr key={o.id}><td>{o.name}</td><td>{o.phone||'—'}</td><td>{o.email||'—'}</td><td>{o.ownership_percent??'—'}</td></tr>}/><h3>Provenance</h3><DataTable columns={['Field','Method','Captured']} rows={selected.provenance} render={(p,i)=><tr key={i}><td>{p.field_name||'—'}</td><td>{p.method}</td><td>{new Date(p.captured_at).toLocaleString()}</td></tr>}/></Detail>}
  </>;
}

function Owners(){const [q,setQ]=useState(''),[items,setItems]=useState([]),[error,setError]=useState('');async function load(){try{const d=await api('/api/owners?'+new URLSearchParams({q}));setItems(d.owners)}catch(e){setError(e.message)}}useEffect(()=>{load()},[]);return <><Panel title="Owner intelligence"><div className="toolbar"><input placeholder="Search owner, phone, email, mailing address" value={q} onChange={e=>setQ(e.target.value)}/><button className="primary small" onClick={load}>Search</button></div></Panel>{error&&<div className="error">{error}</div>}<Panel title={`${items.length} owners`}><DataTable columns={['Name','Phone','Email','Properties','Leads']} rows={items} render={o=><tr key={o.id}><td>{o.name}</td><td>{o.phone||'—'}</td><td>{o.email||'—'}</td><td>{o.property_count}</td><td>{o.lead_count}</td></tr>}/></Panel></>}
function Leads(){const [items,setItems]=useState([]),[error,setError]=useState('');useEffect(()=>{api('/api/leads').then(setItems).catch(e=>setError(e.message))},[]);return <><Panel title="Leads"><p className="muted">Only authorized imported or user-created leads are shown.</p>{error&&<div className="error">{error}</div>}<DataTable columns={['Owner','Property','Phone','Status','Score','Follow-up']} rows={items} render={(x)=><tr key={x.id}><td>{x.owner_name||'—'}</td><td>{x.property_address||'—'}</td><td>{x.phone||x.callback_number||'—'}</td><td><span className="pill">{x.status}</span></td><td>{x.lead_score}</td><td>{x.next_followup_date||'—'} {x.next_followup_time||''}</td></tr>}/></Panel></>}
function Tasks(){const [items,setItems]=useState([]),[error,setError]=useState(''),[title,setTitle]=useState('');async function load(){try{setItems((await api('/api/tasks')).items)}catch(e){setError(e.message)}}useEffect(()=>{load()},[]);async function create(){if(!title.trim())return;try{await api('/api/tasks',{method:'POST',body:JSON.stringify({title})});setTitle('');load()}catch(e){setError(e.message)}}return <><Panel title="Tasks"><div className="toolbar"><input placeholder="New task title" value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>e.key==='Enter'&&create()}/><button className="primary small" onClick={create}>Create</button></div></Panel>{error&&<div className="error">{error}</div>}<Panel title={`${items.length} tasks`}><DataTable columns={['Task','Status','Priority','Due','Assigned']} rows={items} render={x=><tr key={x.id}><td>{x.title}</td><td>{x.status}</td><td>{x.priority}</td><td>{x.due_at?new Date(x.due_at).toLocaleString():'—'}</td><td>{x.assigned_user_name||'—'}</td></tr>}/></Panel></>}
function Imports(){const [csv,setCsv]=useState(''),[filename,setFilename]=useState('upload.csv'),[preview,setPreview]=useState(null),[result,setResult]=useState(null),[items,setItems]=useState([]),[error,setError]=useState('');async function load(){try{setItems((await api('/api/imports')).items)}catch(e){setError(e.message)}}useEffect(()=>{load()},[]);async function previewCsv(){try{setResult(null);setPreview(await api('/api/imports/preview',{method:'POST',body:JSON.stringify({csv})}))}catch(e){setError(e.message)}}async function importCsv(){try{setResult(await api('/api/imports/csv',{method:'POST',body:JSON.stringify({csv,filename})}));setCsv('');load()}catch(e){setError(e.message)}}return <><Panel title="Authorized CSV import"><p className="muted">Import real source data only. The server records source, content hash, row validation, duplicates, and provenance.</p><div className="toolbar"><input value={filename} onChange={e=>setFilename(e.target.value)} placeholder="Filename"/></div><textarea className="csv-box" value={csv} onChange={e=>setCsv(e.target.value)} placeholder="Paste CSV text here"/><div className="toolbar"><button className="secondary" onClick={previewCsv} disabled={!csv.trim()}>Preview</button><button className="primary small" onClick={importCsv} disabled={!csv.trim()}>Import</button></div>{error&&<div className="error">{error}</div>}{preview&&<div className="import-summary">Preview: {preview.totalRows} rows · showing {preview.preview.length}</div>}{result&&<div className="success">Imported {result.importedRows} of {result.totalRows} rows; {result.invalidRows} invalid.</div>}</Panel><Panel title="Import history"><DataTable columns={['File','Status','Rows','Imported','Created']} rows={items} render={x=><tr key={x.id}><td>{x.filename}</td><td>{x.status}</td><td>{x.total_rows}</td><td>{x.imported_rows}</td><td>{new Date(x.created_at).toLocaleString()}</td></tr>}/></Panel></>}
function Activity(){const [items,setItems]=useState([]),[error,setError]=useState('');useEffect(()=>{api('/api/foundation/audit').then(d=>setItems(d.items)).catch(e=>setError(e.message))},[]);return <Panel title="Audit activity"><p className="muted">Visible only to roles with audit administration permission.</p>{error?<div className="error">{error}</div>:<DataTable columns={['Action','Entity','Actor','Time']} rows={items} render={(x)=><tr key={x.id}><td>{x.action}</td><td>{x.entity_type}</td><td>{x.actor_name||'System'}</td><td>{new Date(x.created_at).toLocaleString()}</td></tr>}/>}</Panel>}
function Settings(){const [data,setData]=useState(null),[error,setError]=useState('');useEffect(()=>{api('/api/foundation/settings').then(setData).catch(e=>setError(e.message))},[]);return <Panel title="System settings">{error?<div className="error">{error}</div>:<pre className="json">{JSON.stringify(data?.settings||{},null,2)}</pre>}</Panel>}
function Admin(){const [items,setItems]=useState([]),[error,setError]=useState('');useEffect(()=>{api('/api/foundation/members').then(d=>setItems(d.items)).catch(e=>setError(e.message))},[]);return <Panel title="Organization members">{error?<div className="error">{error}</div>:<DataTable columns={['Name','Email','Role','Status']} rows={items} render={x=><tr key={x.id}><td>{x.name}</td><td>{x.email}</td><td><span className="pill">{x.role}</span></td><td>{x.status}</td></tr>}/>}</Panel>}
function Pending({title}){return <Panel title={title}><div className="empty"><h3>Backend capability pending</h3><p>This navigation item is visible, but the required production backend is not implemented yet. No fake records are shown.</p></div></Panel>}
function Panel({title,children}){return <div className="panel"><div className="panel-head"><h2>{title}</h2></div>{children}</div>}
function Detail({title,onClose,children}){return <div className="detail-overlay"><div className="detail-card"><div className="panel-head"><h2>{title}</h2><button className="secondary" onClick={onClose}>Close</button></div>{children}</div></div>}
function DataTable({columns,rows,render}){if(!rows?.length)return <div className="empty"><h3>No records</h3><p>No authorized business records match the current scope.</p></div>;return <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((x,i)=>render(x,i))}</tbody></table></div>}
function KeyValues({data}){return <div className="key-grid">{Object.entries(data).map(([k,v])=><div key={k}><span>{k}</span><strong>{v??'—'}</strong></div>)}</div>}

createRoot(document.getElementById('root')).render(<App/>);
