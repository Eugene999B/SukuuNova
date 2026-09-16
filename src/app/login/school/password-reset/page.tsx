"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import "../../login.css";

export default function SchoolPasswordResetPage(){
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
       const r=await fetch("/api/auth/school/password-reset/confirm",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({uniqueCode:schoolCode,identifier,token:String(form.get("token")??""),newPassword,universe:"school"})});
       const d=await r.json();
       setMessage(r.ok?"Your password has been reset. You can now sign in with your new password.":(d.error||"The verification code is invalid or expired."));
     }else{
       const r=await fetch("/api/auth/school/password-reset/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({uniqueCode:schoolCode,identifier,universe:"school"})});
       const d=await r.json();
       if(r.ok)setStage("confirm");
       setMessage(d.message||"If the account exists, a 6-digit code has been sent. It expires in 10 minutes.");
     }
   }catch{setMessage("Unable to reach SukuuNova right now. Please try again.")}finally{setPending(false)}
 }
 return <main className="auth-shell"><section className="auth-visual"><div className="auth-orbit"/><div className="auth-grid"/><div className="auth-copy"><div className="auth-kicker"><span className="auth-dot"/> Account recovery</div><h2>Get back into your <span>school workspace.</span></h2><p>{stage==="confirm"?"Enter the 6-digit verification code sent to your account. The code is valid for 10 minutes.":"Use your school code and account phone or email. SukuuNova sends the verification code by SMS when a phone number is available."}</p></div></section><section className="auth-form-pane"><div className="auth-panel"><Link href="/login/school" className="auth-brand"><span className="auth-brand-mark">S</span><span><strong>SukuuNova</strong><small>School management platform</small></span></Link><div className="auth-context">🔐 Password recovery</div><div className="auth-heading"><h1>{stage==="confirm"?"Enter verification code.":"Reset your password."}</h1><p>{stage==="confirm"?"Use the code within 10 minutes and choose a new password.":"Enter the contact details connected to your school account."}</p></div><form className="auth-form" onSubmit={submit}><div className="auth-field"><label>School code</label><input value={schoolCode} onChange={e=>setSchoolCode(e.target.value)} placeholder="e.g. GREENHILL" required readOnly={stage==="confirm"}/></div><div className="auth-field"><label>Email or phone</label><input value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="024... or name@school.com" required readOnly={stage==="confirm"}/></div>{stage==="confirm"&&<><div className="auth-field"><label>6-digit verification code</label><input name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="000000"/></div><div className="auth-field"><label>New password</label><input name="newPassword" type="password" autoComplete="new-password" minLength={12} required placeholder="At least 12 characters"/></div><div className="auth-field"><label>Confirm new password</label><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required placeholder="Repeat your new password"/></div></>}{message&&<p className="auth-error" role="status">{message}</p>}<button className="auth-submit" disabled={pending} type="submit">{pending?(stage==="confirm"?"Resetting password…":"Sending code…"):(stage==="confirm"?"Verify & reset password":"Send verification code")}{!pending&&<span>→</span>}</button>{stage==="confirm"&&<button className="auth-submit" type="button" disabled={pending} onClick={()=>{setStage("request");setMessage("");}}>Use different details</button>}</form><div className="auth-divider">Remembered it?</div><div className="auth-secondary"><Link href="/login/school">← Back to sign in</Link><Link href="/">Home</Link></div></div></section></main>;
}
