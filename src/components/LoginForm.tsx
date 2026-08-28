"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Props = | { universe: "school" } | { universe: "platform" };

export function LoginForm(props: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    const body = props.universe === "school" ? { uniqueCode: String(data.get("uniqueCode") ?? ""), identifier: String(data.get("identifier") ?? ""), password: String(data.get("password") ?? "") } : { email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") };
    try {
      const response = await fetch(`/api/auth/${props.universe}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) { setError(result.message || "Login failed. Please check your details and try again."); return; }
      if (props.universe === "school" && result.user?.needsPasswordChange) router.push("/account/security?required=1");
      else if (props.universe === "school" && result.user?.portal === "teacher") router.push("/teacher");
      else router.push(props.universe === "platform" ? "/platform" : "/dashboard");
      router.refresh();
    } catch { setError("Unable to reach SukuuNova right now. Please try again."); }
    finally { setPending(false); }
  }

  return <form className="auth-form" onSubmit={submit}>
    {props.universe === "school" ? <><div className="auth-field"><label htmlFor="uniqueCode">School code</label><input id="uniqueCode" name="uniqueCode" autoComplete="organization" placeholder="e.g. GREENHILL" required /></div><div className="auth-field"><label htmlFor="identifier">Email or phone</label><input id="identifier" name="identifier" autoComplete="username" placeholder="name@school.com" required /></div></> : <div className="auth-field"><label htmlFor="email">Administrator email</label><input id="email" name="email" type="email" autoComplete="username" placeholder="admin@company.com" required /></div>}
    <div className="auth-field"><label htmlFor="password"><span>Password</span><Link className="auth-forgot" href={props.universe === "school" ? "/login/school/password-reset" : "/login/platform/password-reset"}>Forgot password?</Link></label><input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></div>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    <button className="auth-submit" disabled={pending} type="submit">{pending ? "Signing you in…" : props.universe === "school" ? "Enter school workspace" : "Enter platform control"}{!pending ? <span>→</span> : null}</button>
  </form>;
}
