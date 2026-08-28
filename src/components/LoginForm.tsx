"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Props =
  | { universe: "school" }
  | { universe: "platform" };

export function LoginForm(props: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const data = new FormData(event.currentTarget);
    const body =
      props.universe === "school"
        ? {
            uniqueCode: data.get("uniqueCode"),
            identifier: data.get("identifier"),
            password: data.get("password")
          }
        : {
            email: data.get("email"),
            password: data.get("password")
          };

    try {
      const response = await fetch("/api/auth/" + props.universe + "/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message || "Login failed.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to reach SukuuNova. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      {props.universe === "school" ? (
        <>
          <label className="login-field">
            <span>School code</span>
            <input name="uniqueCode" autoComplete="organization" required />
          </label>
          <label className="login-field">
            <span>Email or phone</span>
            <input name="identifier" autoComplete="username" required />
          </label>
        </>
      ) : (
        <label className="login-field">
          <span>Admin email</span>
          <input name="email" type="email" autoComplete="username" required />
        </label>
      )}
      <label className="login-field">
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error ? <p className="login-error" role="alert">{error}</p> : null}
      <button className="login-submit" disabled={pending} type="submit">
        {pending ? "Signing in…" : "Sign in"}
        {!pending ? <span>→</span> : null}
      </button>
    </form>
  );
}
