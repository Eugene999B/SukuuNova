"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import "../../login.css";

export default function GuardianPasswordResetPage(){
  const [stage,setStage]=useState<"request"|"confirm">("request");
  const [schoolCode,setSchoolCode]=useState("");
  const [identifier,setIdentifier]=useState("");
  const [message,setMessage]=useState("");
  const [pending,setPending]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setPending(true);setMessage("");const form=new FormData(e.currentTarget);
    try{
      if(stage==="confirm"){
        const newPassword=String(form.get("newPassword")??"");
        const confirm=String(form.get("confirmPassword")??"");
        if(newPassword!==confirm){setMessage("New passwords do not match.");return;}
        const response=await fetch("/api/auth/school/password-reset/confirm",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({uniqueCode:schoolCode,identifier,token:String(form.get("token")??""),newPassword,universe:"guardian"})});
        const data=await response.json();
        setMessage(response.ok?"Your guardian password has been reset. You can now sign in with your new password.":(data.error||"The verification code is invalid or expired."));
      }else{
        const response=await fetch("/api/auth/school/password-reset/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({uniqueCode:schoolCode,identifier,universe:"guardian"})});
        const data=await response.json();
        if(response.ok)setStage("confirm");
        setMessage(data.message||"If the guardian account exists, a 6-digit code has been sent. It expires in 10 minutes.");
      }
    }catch{setMessage("Unable to reach SukuuNova right now. Please try again.");}
    finally{setPending(false);}
  }
  return <main className="auth-shell"><section className="auth-visual"><div className="auth-orbit"/><div className="auth-grid"/><div className="auth-copy"><div className="auth-kicker"><span className="auth-dot"/> Family account recovery</div><h2>Get back to your <span>family portal.</span></h2><p>{stage==="confirm"?"Enter the 6-digit verification code sent to your account. It expires after 10 minutes.":"Use the school code and phone or email connected to your guardian account. SMS is used when a phone number is available."}</p></div></section><section className="auth-form-pane"><div className="auth-panel"><Link href="/login/school" className="auth-brand"><span className="auth-brand-mark">S</span><span><strong>SukuuNova</strong><small>Family access</small></span></Link><div className="auth-context">🔐 Guardian recovery</div><div className="auth-heading"><h1>{stage==="confirm"?"Enter verification code.":"Reset your password."}</h1><p>{stage==="confirm"?"Use the code within 10 minutes and choose a new password.":"Enter your school and contact details to receive a verification code."}</p></div><form className="auth-form" onSubmit={submit}><div className="auth-field"><label htmlFor="schoolCode">School code</label><input id="schoolCode" value={schoolCode} onChange={e=>setSchoolCode(e.target.value)} autoComplete="organization" placeholder="e.g. TEST001" required readOnly={stage==="confirm"}/></div><div className="auth-field"><label htmlFor="identifier">Phone or email</label><input id="identifier" value={identifier} onChange={e=>setIdentifier(e.target.value)} autoComplete="username" placeholder="024... or name@email.com" required readOnly={stage==="confirm"}/></div>{stage==="confirm"&&<><div className="auth-field"><label htmlFor="token">6-digit verification code</label><input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="000000"/></div><div className="auth-field"><label htmlFor="newPassword">New password</label><input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={12} required placeholder="At least 12 characters"/></div><div className="auth-field"><label htmlFor="confirmPassword">Confirm new password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required placeholder="Repeat your new password"/></div></>}{message&&<p className="auth-error" role="status">{message}</p>}<button className="auth-submit" disabled={pending} type="submit">{pending?(stage==="confirm"?"Resetting password…":"Sending code…"):(stage==="confirm"?"Verify & reset password":"Send verification code")}{!pending&&<span>→</span>}</button>{stage==="confirm"&&<button className="auth-submit" type="button" disabled={pending} onClick={()=>{setStage("request");setMessage("");}}>Use different details</button>}</form><div className="auth-divider">Return</div><div className="auth-secondary"><Link href="/login/school">← School access</Link><Link href="/">Home</Link></div></div></section></main>;
}
