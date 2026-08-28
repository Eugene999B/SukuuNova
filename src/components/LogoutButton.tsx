"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({
  universe
}: {
  universe: "school" | "platform";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch("/api/auth/" + universe + "/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
      disabled={pending}
      onClick={logout}
      type="button"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
