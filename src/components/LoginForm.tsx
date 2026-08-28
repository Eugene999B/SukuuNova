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
    <form className="mt-8 space-y-5" onSubmit={submit}>
      {props.universe === "school" ? (
        <>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">School code</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-nova focus:ring-2 focus:ring-teal-100"
              name="uniqueCode"
              autoComplete="organization"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email or phone</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-nova focus:ring-2 focus:ring-teal-100"
              name="identifier"
              autoComplete="username"
              required
            />
          </label>
        </>
      ) : (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Admin email</span>
          <input
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-nova focus:ring-2 focus:ring-teal-100"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </label>
      )}
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-nova focus:ring-2 focus:ring-teal-100"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-xl bg-nova px-5 py-3 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
