import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const navigate = useNavigate(); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState<string|null>(null); const [pending,setPending]=useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setPending(true)
    try { const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})}); const body=await response.json().catch(()=>({})); if(!response.ok) throw new Error(body.error?.message||'Unable to sign in'); localStorage.setItem('vortex_one_token',body.token); localStorage.setItem('vortex_one_user',JSON.stringify(body.user)); await navigate({to:'/'}) }
    catch(err){setError(err instanceof Error?err.message:'Unable to sign in')} finally{setPending(false)}
  }
  return <div className="mx-auto max-w-md rounded-2xl border bg-white p-8 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Vortex One</p><h2 className="mt-3 text-2xl font-semibold">Sign in</h2><p className="mt-2 text-sm text-slate-600">Use your organization account.</p><form className="mt-7 space-y-4" onSubmit={submit}><label className="block text-sm font-medium">Email<input className="mt-2 w-full rounded-lg border px-3 py-2" type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label className="block text-sm font-medium">Password<input className="mt-2 w-full rounded-lg border px-3 py-2" type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}/></label>{error?<p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>:null}<button className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">{pending?'Signing in…':'Sign in'}</button></form></div>
}
