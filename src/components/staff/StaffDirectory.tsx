"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import "./staff-profile-link.css";

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
          <span className="staff-simple-person"><strong><Link href={`/school/staff/${encodeURIComponent(person.id)}`}>{person.name}</Link></strong><small>{person.roles[0] ?? "Role not assigned"} · {person.email ?? person.phone ?? "No sign-in contact"}</small></span>
          <span className="staff-simple-scope">{teaching[0] ?? "No teaching assignment"}{teaching.length > 1 ? ` +${teaching.length - 1}` : ""}</span>
          <span className={`staff-simple-status is-${person.status}`}>{person.status === "pending" ? "Needs login" : person.status}</span>
          <Link className="staff-profile-link" href={`/school/staff/${encodeURIComponent(person.id)}`}>Profile <ArrowRight size={14}/></Link>
        </div>;
      })}
    </div> : <div className="staff-simple-empty"><strong>No staff match these filters.</strong><span>Change the search or status filter.</span></div>}
  </div>;
}
