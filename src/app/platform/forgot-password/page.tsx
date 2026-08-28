"use client";
import { useState } from "react";
import Link from "next/link";

type ResetDelivery = { token?: string; expiresAt?: string };
type ResetResult = { message?: string; delivery?: ResetDelivery };

export default function ForgotPasswordPage(){
  const [email,setEmail]=useState("");
  const [result,setResult]=useState<ResetResult|null>(null);
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#071017",color:"#eaf6f3"}}><section className="app-card app-panel" style={{maxWidth:520,width:"100%"}}><p className="app-kpi-label">SukuuNova Platform Control</p><h1>Password recovery</h1><p>Request a short-lived platform administrator reset token. Reset requests are audited.</p><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Administrator email" style={{width:"100%",margin:"14px 0",padding:12}}/><button className="app-action" onClick={async()=>setResult((await (await fetch("/api/auth/platform/reset",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"request",email})})).json()) as ResetResult)}><strong>Request reset</strong>Issue recovery token</button>{result&&<div className="app-banner" style={{marginTop:14}}><div><h3>{result.message}</h3>{result.delivery?.token&&<p style={{wordBreak:"break-all"}}>Token: {result.delivery.token}<br/>Expires: {result.delivery.expiresAt ? new Date(result.delivery.expiresAt).toLocaleString() : "—"}</p>}</div></div>}<Link href="/login/platform" className="app-pill">Back to platform login</Link></section></main>}
