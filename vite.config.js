import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const reportsComponent = `
function Reports(){
  const [data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{api('/api/reports/overview').then(setData).catch(e=>setError(e.message))},[]);
  if(error)return <div className="error">{error}</div>;
  if(!data)return <Panel title="Reports"><p className="muted">Loading live report data…</p></Panel>;
  return <>
    <Panel title="Operational overview">
      <div className="metric-grid">
        {Object.entries(data.totals||{}).map(([key,value])=><div className="metric" key={key}><span>{key.replaceAll('_',' ')}</span><strong>{value??0}</strong><small>Live organization count</small></div>)}
      </div>
      <p className="muted">Generated {new Date(data.generated_at).toLocaleString()}</p>
    </Panel>
    <div className="grid-two">
      <Panel title="Lead status"><DataTable columns={['Status','Count']} rows={data.lead_status||[]} render={x=><tr key={x.status}><td>{x.status}</td><td>{x.count}</td></tr>}/></Panel>
      <Panel title="Call disposition"><DataTable columns={['Disposition','Count']} rows={data.call_disposition||[]} render={x=><tr key={x.disposition}><td>{x.disposition}</td><td>{x.count}</td></tr>}/></Panel>
    </div>
    <Panel title="Property type"><DataTable columns={['Property type','Count']} rows={data.property_type||[]} render={x=><tr key={x.property_type}><td>{x.property_type}</td><td>{x.count}</td></tr>}/></Panel>
  </>;
}
`;

export default defineConfig({
  plugins: [react(), {
    name: 'vortex-reports-component',
    transform(code, id) {
      if (id.endsWith('/src/main.jsx')) {
        return code.replace('function Page({title,active,onNavigate}){', reportsComponent + '\nfunction Page({title,active,onNavigate}){');
      }
      return null;
    }
  }]
});
