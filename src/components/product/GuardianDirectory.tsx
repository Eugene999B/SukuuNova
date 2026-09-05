"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/product/ProductWorkspace";

type GuardianRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  portal: string | null;
  students: Array<{ id: string; name: string; className: string | null }>;
};

export function GuardianDirectory({ guardians }: { guardians: GuardianRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "pending" | "none">("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guardians
      .filter((g) => {
        if (filter === "active") return g.portal === "active";
        if (filter === "pending") return g.portal && g.portal !== "active";
        if (filter === "none") return !g.portal;
        return true;
      })
      .filter((g) => !q || g.name.toLowerCase().includes(q) || (g.phone ?? "").toLowerCase().includes(q) || (g.email ?? "").toLowerCase().includes(q))
      .slice(0, 100);
  }, [guardians, query, filter]);

  return (
    <div>
      <div className="product-searchbar" role="search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone or email…" aria-label="Search guardians" autoComplete="off" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Portal access filter">
          <option value="all">All portal states</option>
          <option value="active">Portal active</option>
          <option value="pending">Pending activation</option>
          <option value="none">No portal</option>
        </select>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "8px 0 0" }}>
        Showing {rows.length} of {guardians.length}. Open a row for relationship and portal detail.
      </p>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>No guardians match. Clear search or add the family record.</p>
      ) : (
        <div className="product-table-wrap" style={{ marginTop: 12 }}>
          <table className="product-table">
            <thead>
              <tr>
                <th scope="col">Guardian</th>
                <th scope="col">Linked children</th>
                <th scope="col">Portal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link href={`/school/guardians/${g.id}`}>{g.name}</Link>
                    <small style={{ display: "block", color: "var(--color-text-muted)" }}>{[g.phone, g.email].filter(Boolean).join(" · ") || "No contact"}</small>
                  </td>
                  <td>{g.students.length ? g.students.map((s) => `${s.name}${s.className ? ` (${s.className})` : ""}`).join(", ") : "Needs child link"}</td>
                  <td>{g.portal ? <StatusBadge tone={g.portal === "active" ? "success" : "warning"}>{g.portal}</StatusBadge> : <StatusBadge tone="neutral">No portal</StatusBadge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
