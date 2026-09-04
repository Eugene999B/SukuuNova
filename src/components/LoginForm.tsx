"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";

type Props = { universe: "school" } | { universe: "platform" };
type SchoolStage = "school" | "role" | "credentials";
type SchoolRole = "staff" | "guardian";

export function LoginForm(props: Props) {
  const router = useRouter();
  const [schoolStage, setSchoolStage] = useState<SchoolStage>(props.universe === "school" ? "school" : "credentials");
  const [schoolCode, setSchoolCode] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolRole, setSchoolRole] = useState<SchoolRole | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function resolveSchoolCode(code: string) {
    const response = await fetch("/api/auth/school/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uniqueCode: code }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "We could not verify that school code.");
    return result.school as { uniqueCode: string; name: string };
  }

  async function submitSchoolCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const code = String(form.get("schoolCode") ?? "").trim();
    if (!code) {
      setError("Enter your school code to continue.");
      setPending(false);
      return;
    }
    try {
      const school = await resolveSchoolCode(code);
      setSchoolCode(school.uniqueCode.toUpperCase());
      setSchoolName(school.name);
      setError("");
      setSchoolStage("role");
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "We could not verify that school code.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    const identifier = String(data.get("identifier") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const platformEmail = String(data.get("email") ?? "").trim();
    try {
      const endpoint = props.universe === "school" && schoolRole === "guardian" ? "/api/auth/guardian/login" : `/api/auth/${props.universe}/login`;
      const body = props.universe === "school" ? (schoolRole === "guardian" ? { schoolCode, identifier, password } : { uniqueCode: schoolCode, identifier, password }) : { email: platformEmail, password };
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { setError(result.message || "The email or password is incorrect."); return; }
      if (props.universe === "school" && schoolRole === "guardian") router.push("/guardian");
      else if (props.universe === "school" && result.user?.needsPasswordChange) router.push("/account/security?required=1");
      else if (props.universe === "school" && result.user?.portal === "teacher") router.push("/teacher");
      else router.push(props.universe === "platform" ? "/platform" : "/dashboard");
      router.refresh();
    } catch { setError("Unable to reach SukuuNova right now. Please try again."); }
    finally { setPending(false); }
  }

  if (props.universe === "school") {
    if (schoolStage === "school") return <form className="auth-form" onSubmit={submitSchoolCode}>
      <div className="auth-stepper" aria-label="Sign-in step 1 of 3"><span className="is-active">1</span><i /><span>2</span><i /><span>3</span></div>
      <div className="auth-field"><label htmlFor="schoolCode">School code</label><input id="schoolCode" name="schoolCode" autoComplete="organization" placeholder="e.g. EUG123" autoFocus required /></div>
      <p className="auth-help-text">Use the code provided by your school. We’ll verify it before showing the available access types.</p>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <button className="auth-submit" disabled={pending} type="submit">{pending ? "Checking school…" : "Continue"}{!pending ? <span>→</span> : null}</button>
    </form>;
    if (schoolStage === "role") return <div className="auth-form">
      <div className="auth-stepper" aria-label="Sign-in step 2 of 3"><span className="is-complete">✓</span><i className="is-complete" /><span className="is-active">2</span><i /><span>3</span></div>
      <div className="auth-school-chip"><span>School</span><strong>{schoolCode}</strong><button type="button" onClick={() => { setSchoolStage("school"); setSchoolName(""); }} aria-label="Change school code">Change</button></div>
      {schoolName ? <p className="auth-help-text">{schoolName}</p> : null}
      <div className="auth-role-heading"><span className="auth-context">Choose your access</span><h2>How are you signing in?</h2><p>Select the account type provided by your school.</p></div>
      <div className="auth-role-grid">
        <button type="button" className="auth-role-card" onClick={() => { setSchoolRole("staff"); setSchoolStage("credentials"); }}><span className="auth-role-icon"><UsersRoundIcon /></span><strong>Staff</strong><small>Teachers, leadership, finance, administration and school support staff.</small><em>Continue as Staff →</em></button>
        <button type="button" className="auth-role-card" onClick={() => { setSchoolRole("guardian"); setSchoolStage("credentials"); }}><span className="auth-role-icon"><GuardianIcon /></span><strong>Guardian</strong><small>Parents and guardians who monitor children connected to their family account.</small><em>Continue as Guardian →</em></button>
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>;
    return <form className="auth-form" onSubmit={submit}>
      <div className="auth-stepper" aria-label="Sign-in step 3 of 3"><span className="is-complete">✓</span><i className="is-complete" /><span className="is-complete">✓</span><i className="is-complete" /><span className="is-active">3</span></div>
      <div className="auth-school-chip"><span>{schoolRole === "guardian" ? "Guardian" : "Staff"}</span><strong>{schoolCode}</strong><button type="button" onClick={() => setSchoolStage("role")} aria-label="Change access type">Change</button></div>
      <div className="auth-field"><label htmlFor="identifier">Email or phone</label><div className="auth-input-with-icon"><Mail size={16} aria-hidden="true" /><input id="identifier" name="identifier" autoComplete="username" placeholder="name@school.com or 024…" autoFocus required /></div></div>
      <div className="auth-field"><label htmlFor="password"><span>Password</span><Link className="auth-forgot" href="/login/school/password-reset">Forgot password?</Link></label><div className="auth-input-with-icon"><LockKeyhole size={16} aria-hidden="true" /><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required /><button className="auth-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <button className="auth-submit" disabled={pending} type="submit">{pending ? "Signing you in…" : schoolRole === "guardian" ? "Open guardian portal" : "Sign in"}{!pending ? <span>→</span> : null}</button>
      <Link href="/login/school/password-reset" className="auth-safety-link">Need help resetting access?</Link>
    </form>;
  }
  return <form className="auth-form" onSubmit={submit}>
    <div className="auth-field"><label htmlFor="email">Administrator email</label><div className="auth-input-with-icon"><Mail size={16} aria-hidden="true" /><input id="email" name="email" type="email" autoComplete="username" placeholder="admin@company.com" required /></div></div>
    <div className="auth-field"><label htmlFor="password"><span>Password</span><Link className="auth-forgot" href="/login/platform/password-reset">Forgot password?</Link></label><div className="auth-input-with-icon"><LockKeyhole size={16} aria-hidden="true" /><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required /><button className="auth-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <button className="auth-submit" disabled={pending} type="submit">{pending ? "Signing you in…" : "Sign in"}{!pending ? <span>→</span> : null}</button>
  </form>;
}

function UsersRoundIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function GuardianIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>; }
