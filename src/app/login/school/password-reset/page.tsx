"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import "../../login.css";

export default function SchoolPasswordResetPage(){
 const searchParams=useSearchParams();
 const token=searchParams.get("token") ?? "";
 const initialSchoolCode=searchParams.get("schoolCode") ?? "";
 const [message,setMessage]=useState(""); const [pending,setPending]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setPending(true);setMessage("");const form=new FormData(e.currentTarget);try{
   if(token){
     const newPassword=String(form.get("newPassword")??"");
     const confirm=String(form.get("confirmPassword")??"");
     if(newPassword!==confirm){setMessage("New passwords do not match.");return;}
     const r=await fetch("/api/auth/school/password-reset/confirm",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({uniqueCode:form.get("uniqueCode"),token,newPassword,universe:"school"})});
     const d=await r.json();
     setMessage(r.ok?"Your password has been reset. You can now sign in with your new password.":(d.error||"We could not complete the password reset."));
   }else{
     const r=await fetch("/api/auth/school/password-reset/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({uniqueCode:form.get("uniqueCode"),identifier:form.get("identifier"),universe:"school"})});
     const d=await r.json();setMessage(d.message||"If the account exists, recovery instructions have been prepared.");
   }
 }catch{setMessage("Unable to reach SukuuNova right now. Please try again.")}finally{setPending(false)}}
 return <main className="auth-shell"><section className="auth-visual"><div className="auth-orbit"/><div className="auth-grid"/><div className="auth-copy"><div className="auth-kicker"><span className="auth-dot"/> Account recovery</div><h2>Get back into your <span>school workspace.</span></h2><p>{token?"Choose a new private password for your school account.":"Use your school code and account email or phone to begin a secure password reset."}</p></div></section><section className="auth-form-pane"><div className="auth-panel"><Link href="/login/school" className="auth-brand"><span className="auth-brand-mark">S</span><span><strong>SukuuNova</strong><small>School management platform</small></span></Link><div className="auth-context">🔐 Password recovery</div><div className="auth-heading"><h1>{token?"Set a new password.":"Reset your password."}</h1><p>{token?"Your recovery link is ready. Set a new password to continue.":"Enter your school details and we’ll begin the recovery process."}</p></div><form className="auth-form" onSubmit={submit}><div className="auth-field"><label>School code</label><input name="uniqueCode" defaultValue={initialSchoolCode} placeholder="e.g. GREENHILL" required readOnly={Boolean(initialSchoolCode&&token)}/></div>{token?<><div className="auth-field"><label>New password</label><input name="newPassword" type="password" autoComplete="new-password" minLength={12} required placeholder="At least 12 characters"/></div><div className="auth-field"><label>Confirm new password</label><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required placeholder="Repeat your new password"/></div></>:<div className="auth-field"><label>Email or phone</label><input name="identifier" placeholder="name@school.com" required/></div>}{message&&<p className="auth-error" role="status">{message}</p>}<button className="auth-submit" disabled={pending} type="submit">{pending?(token?"Resetting password…":"Preparing recovery…"):(token?"Set new password":"Continue recovery")}{!pending&&<span>→</span>}</button></form><div className="auth-divider">Remembered it?</div><div className="auth-secondary"><Link href="/login/school">← Back to sign in</Link><Link href="/">Home</Link></div></div></section></main>;
}
