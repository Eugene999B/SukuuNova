"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Universe = "school" | "platform" | "guardian" | "teacher";
export function LogoutButton({ universe, compact: _compact = false }: { universe: Universe; compact?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    const authUniverse = universe === "teacher" ? "school" : universe;
    await fetch("/api/auth/" + authUniverse + "/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60" disabled={pending} onClick={logout} type="button">{pending ? "Signing out…" : "Sign out"}</button>;
}
