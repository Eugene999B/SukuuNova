"use client";

import { useState } from "react";

type Role = { id: string; name: string };
type User = { id: string; name: string; roleNames: string[] };

export default function AnnouncementComposer({ roles, users }: { roles: Role[]; users: User[] }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all_staff");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setStatus("");
    try {
      const response = await fetch("/api/school/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, audience, roleId, userId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Announcement could not be published.");
      setStatus(`Published to ${result.recipientCount} account${result.recipientCount === 1 ? "" : "s"}.`);
      setTitle("");
      setBody("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Announcement could not be published.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="module-card">
      <div className="module-section-title">
        <div><span>Internal communications</span><h3>Publish an announcement</h3><p>Deliver inside SukuuNova first; reserve SMS and WhatsApp for channels that actually need them.</p></div>
        <span className="app-pill">In-app delivery</span>
      </div>
      <div className="module-compose-preview" style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" aria-label="Announcement title" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the message for the selected audience…" aria-label="Announcement body" rows={7} />
        <div className="module-audience-grid">
          <button type="button" onClick={() => setAudience("all_staff")} aria-pressed={audience === "all_staff"}><b>All staff</b><span>Every active school account</span></button>
          <button type="button" onClick={() => setAudience("teaching_staff")} aria-pressed={audience === "teaching_staff"}><b>Teaching staff</b><span>Teachers and teaching roles</span></button>
          <button type="button" onClick={() => setAudience("guardians")} aria-pressed={audience === "guardians"}><b>Guardians</b><span>Guardian portal accounts</span></button>
          <button type="button" onClick={() => setAudience("role")} aria-pressed={audience === "role"}><b>Specific role</b><span>Choose one workforce role</span></button>
          <button type="button" onClick={() => setAudience("individual")} aria-pressed={audience === "individual"}><b>Individual account</b><span>Send to one named user</span></button>
        </div>
        {audience === "role" ? <select value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label="Role audience">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select> : null}
        {audience === "individual" ? <select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Individual recipient">{users.map((user) => <option key={user.id} value={user.id}>{user.name}{user.roleNames.length ? ` · ${user.roleNames.join(", ")}` : ""}</option>)}</select> : null}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <small style={{ color: "#627b80" }}>Announcements are recorded in the school audit trail.</small>
          <button className="module-hero-button" type="button" onClick={submit} disabled={pending || !title.trim() || !body.trim()}>{pending ? "Publishing…" : "Publish announcement →"}</button>
        </div>
        {status ? <p role="status" style={{ margin: 0, color: status.startsWith("Published") ? "#72e3c1" : "#ff9b9b", fontSize: 9 }}>{status}</p> : null}
      </div>
    </section>
  );
}
