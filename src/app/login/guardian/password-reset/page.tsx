"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import "../../login.css";

export default function GuardianPasswordResetPage(){
  const [token,setToken]=useState("");
  const [initialSchoolCode,setInitialSchoolCode]=useState("");
  const [message,setMessage]=useState("");
  const [pending,setPending]=useState(false);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);setToken(params.get("token")??"");setInitialSchoolCode(params.get("schoolCode")??"");},[]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setPending(true); setMessage("");
    const form=new FormData(e.currentTarget);
    try{
      if(token){
        const newPassword=String(form.get("newPassword")??"");
        const confirm=String(form.get("confirmPassword")??"");
        if(newPassword!==confirm){setMessage("New passwords do not match.");return;}
        const response=await fetch("/api/auth/school/password-reset/confirm",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({uniqueCode:form.get("schoolCode"),token,newPassword,universe:"guardian"})});
        const data=await response.json();
        setMessage(response.ok?"Your guardian password has been reset. You can now sign in with your new password.":(data.error||"We could not complete the password reset."));
      }else{
        const response=await fetch("/api/auth/school/password-reset/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({uniqueCode:form.get("schoolCode"),identifier:form.get("identifier"),universe:"guardian"})});
        const data=await response.json();
        setMessage(data.message||"If the guardian account exists, reset instructions will be delivered.");
      }
    }catch{setMessage("Unable to reach SukuuNova right now. Please try again.");}
    finally{setPending(false);}
  }
  return <main className="auth-shell"><section className="auth-visual"><div className="auth-orbit"/><div className="auth-grid"/><div className="auth-copy"><div className="auth-kicker"><span className="auth-dot"/> Family account recovery</div><h2>Get back to your <span>family portal.</span></h2><p>{token?"Choose a new private password for your guardian account.":"Use the school code and phone or email connected to your guardian account to start a secure password reset."}</p></div></section><section className="auth-form-pane"><div className="auth-panel"><Link href="/login/school" className="auth-brand"><span className="auth-brand-mark">S</span><span><strong>SukuuNova</strong><small>Family access</small></span></Link><div className="auth-context">🔐 Guardian recovery</div><div className="auth-heading"><h1>{token?"Set a new password.":"Reset your password."}</h1><p>{token?"Your recovery link is ready. Set a new password to continue.":"Enter your school details and contact details used for your account."}</p></div><form className="auth-form" onSubmit={submit}><div className="auth-field"><label htmlFor="schoolCode">School code</label><input id="schoolCode" name="schoolCode" autoComplete="organization" defaultValue={initialSchoolCode} placeholder="e.g. TEST001" required readOnly={Boolean(initialSchoolCode&&token)}/></div>{token?<><div className="auth-field"><label htmlFor="newPassword">New password</label><input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={12} required placeholder="At least 12 characters"/></div><div className="auth-field"><label htmlFor="confirmPassword">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required placeholder="Repeat your new password"/></div></>:<div className="auth-field"><label htmlFor="identifier">Phone or email</label><input id="identifier" name="identifier" autoComplete="username" placeholder="024... or name@email.com" required/></div>}{message&&<p className="auth-error" role="status">{message}</p>}<button className="auth-submit" disabled={pending} type="submit">{pending?(token?"Resetting password…":"Preparing recovery…"):(token?"Set new password":"Continue recovery")}{!pending&&<span>→</span>}</button></form><div className="auth-divider">Return</div><div className="auth-secondary"><Link href="/login/school">← School access</Link><Link href="/">Home</Link></div></div></section></main>;
}
