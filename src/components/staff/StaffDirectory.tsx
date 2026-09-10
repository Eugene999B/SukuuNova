"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";

type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  roles: string[];
  classLead: string[];
  assignments: string[];
};

export function StaffDirectory({ people }: { people: StaffRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<StaffRow | null>(null);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((person) => {
      if (status !== "all" && person.status !== status) return false;
      if (q && !`${person.name} ${person.email ?? ""} ${person.phone ?? ""} ${person.roles.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [people, query, status]);

  return <div className="staff-simple-directory">
    <div className="staff-simple-toolbar">
      <label><span>Search staff</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, contact or role" /></label>
      <label><span>Login status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All</option><option value="active">Active</option><option value="pending">Needs login</option><option value="suspended">Suspended</option></select></label>
    </div>
    <div className="staff-simple-count"><strong>{rows.length}</strong> person{rows.length === 1 ? "" : "s"} shown</div>
    {rows.length ? <div className="staff-simple-list">
      {rows.map((person) => {
        const teaching = [...person.classLead, ...person.assignments];
        return <div className="staff-simple-row" key={person.id}>
          <span className="staff-simple-avatar">{person.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
          <span className="staff-simple-person"><strong>{person.name}</strong><small>{person.roles[0] ?? "Role not assigned"} · {person.email ?? person.phone ?? "No sign-in contact"}</small></span>
          <span className="staff-simple-scope">{teaching[0] ?? "No teaching assignment"}{teaching.length > 1 ? ` +${teaching.length - 1}` : ""}</span>
          <span className={`staff-simple-status is-${person.status}`}>{person.status === "pending" ? "Needs login" : person.status}</span>
          <button type="button" onClick={() => setSelected(person)}>View</button>
        </div>;
      })}
    </div> : <div className="staff-simple-empty"><strong>No staff match these filters.</strong><span>Change the search or status filter.</span></div>}

    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name ?? "Staff details"} description={selected ? (selected.email ?? selected.phone ?? "School staff profile") : undefined} size="md">
      {selected ? <div className="staff-detail-dialog">
        <section><span>Login status</span><strong>{selected.status === "pending" ? "Needs activation" : selected.status}</strong>{selected.status === "pending" ? <Link href={`/school/settings/access?userId=${encodeURIComponent(selected.id)}`}>Activate login →</Link> : null}</section>
        <section><span>Roles</span><div className="staff-detail-pills">{selected.roles.length ? selected.roles.map((role) => <b key={role}>{role}</b>) : <b>Unassigned</b>}</div></section>
        <section><span>Teaching scope</span><div className="staff-detail-lines">{[...selected.classLead, ...selected.assignments].length ? [...selected.classLead, ...selected.assignments].map((item) => <b key={item}>{item}</b>) : <b>No teaching assignment</b>}</div></section>
        <section><span>Contact</span><strong>{selected.email ?? "No email"}</strong><small>{selected.phone ?? "No phone"}</small></section>
      </div> : null}
    </Dialog>
  </div>;
}
