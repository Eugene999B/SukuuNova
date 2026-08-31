"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";

type Device = {
  id: string;
  deviceSerial: string;
  kind: string;
  label: string;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
};

type Identity = {
  id: string;
  deviceKind: string;
  externalId: string;
  studentId: string | null;
  staffId: string | null;
  createdAt: string;
};

type Person = { id: string; name: string; admissionNo?: string; email?: string | null };

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [students, setStudents] = useState<Person[]>([]);
  const [staff, setStaff] = useState<Person[]>([]);
  const [serial, setSerial] = useState("");
  const [label, setLabel] = useState("Main Gate");
  const [kind, setKind] = useState("fingerprint");
  const [secret, setSecret] = useState("");
  const [externalId, setExternalId] = useState("");
  const [identityKind, setIdentityKind] = useState("fingerprint");
  const [targetType, setTargetType] = useState("student");
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");

  async function loadDevices() {
    const response = await fetch("/api/school/devices");
    const data = await response.json();
    if (!response.ok) return setMessage(data.message ?? "Could not load devices.");
    setDevices(data.devices ?? []);
  }

  async function loadIdentities() {
    const response = await fetch("/api/school/devices/identities");
    const data = await response.json();
    if (!response.ok) return setMessage(data.message ?? "Could not load hardware identities.");
    setIdentities(data.identities ?? []);
    setStudents(data.students ?? []);
    setStaff(data.staff ?? []);
    setTargetId((current) => current || (targetType === "student" ? data.students?.[0]?.id : data.staff?.[0]?.id) || "");
  }

  useEffect(() => {
    void loadDevices();
    void loadIdentities();
  }, []);

  async function registerDevice() {
    setMessage("");
    setSecret("");
    const response = await fetch("/api/school/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceSerial: serial, kind, label })
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.message ?? "Could not register device.");
    setSecret(data.deviceSecret);
    setMessage("Device registered. Copy the secret now; it will never be shown again.");
    setSerial("");
    await loadDevices();
  }

  async function revokeDevice(id: string) {
    if (!window.confirm("Revoke this device? It will stop accepting attendance immediately.")) return;
    const response = await fetch("/api/school/devices", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action: "revoke" })
    });
    const data = await response.json();
    setMessage(response.ok ? "Device revoked." : data.message ?? "Could not revoke device.");
    if (response.ok) await loadDevices();
  }

  async function saveIdentity() {
    const response = await fetch("/api/school/devices/identities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceKind: identityKind, externalId, targetType, targetId })
    });
    const data = await response.json();
    setMessage(response.ok ? "Hardware identity mapping saved." : data.message ?? "Could not save mapping.");
    if (response.ok) {
      setExternalId("");
      await loadIdentities();
    }
  }

  async function removeIdentity(id: string) {
    const response = await fetch("/api/school/devices/identities", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await response.json();
    setMessage(response.ok ? "Mapping removed." : data.message ?? "Could not remove mapping.");
    if (response.ok) await loadIdentities();
  }

  const people = targetType === "student" ? students : staff;

  return (
    <AppShell
      universe="school"
      title="Biometric Attendance Devices"
      subtitle="Register attendance terminals, issue one-time secrets, map hardware identities, and revoke lost devices."
      active="Security & Access"
    >
      <main style={{ display: "grid", gap: 18 }}>
        <section className="app-card app-panel">
          <p className="app-kpi-label">DEVICE REGISTRATION</p>
          <h2>Connect an attendance terminal</h2>
          <div style={{ display: "grid", gap: 12, maxWidth: 820, gridTemplateColumns: "1fr 1fr" }}>
            <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Device serial" />
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Main Gate" />
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="fingerprint">Fingerprint</option>
              <option value="face">Face</option>
              <option value="card">Card</option>
            </select>
            <button className="app-action" onClick={() => void registerDevice()} disabled={!serial.trim() || !label.trim()}>
              <strong>Register device</strong>
            </button>
          </div>
          {secret ? (
            <div className="app-banner" style={{ marginTop: 14 }}>
              <strong>Copy this device secret now</strong>
              <p style={{ wordBreak: "break-all" }}>{secret}</p>
            </div>
          ) : null}
        </section>

        <section className="app-card app-panel">
          <p className="app-kpi-label">IDENTITY MAPPING</p>
          <h2>Map fingerprint/card IDs to people</h2>
          <p>Vendor external IDs are mapped to a student or staff identity. SukuuNova does not store raw fingerprint templates or card credentials.</p>
          <div style={{ display: "grid", gap: 12, maxWidth: 900, gridTemplateColumns: "1fr 1fr 1fr" }}>
            <select value={identityKind} onChange={(e) => setIdentityKind(e.target.value)}><option value="fingerprint">Fingerprint</option><option value="card">Card</option></select>
            <input value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="Vendor external ID" />
            <select value={targetType} onChange={(e) => { const next = e.target.value; setTargetType(next); setTargetId((next === "student" ? students[0]?.id : staff[0]?.id) ?? ""); }}><option value="student">Student</option><option value="staff">Staff</option></select>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.admissionNo ? ` · ${person.admissionNo}` : ""}</option>)}</select>
            <button className="app-action" onClick={() => void saveIdentity()} disabled={!externalId.trim() || !targetId}><strong>Save mapping</strong></button>
          </div>
          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            {identities.map((identity) => {
              const person = identity.studentId ? students.find((p) => p.id === identity.studentId) : staff.find((p) => p.id === identity.staffId);
              return <div key={identity.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "center", border: "1px solid var(--app-line,#d7e0e0)", padding: 10, borderRadius: 10 }}><span>{identity.deviceKind}</span><strong>{identity.externalId}</strong><span>{person?.name ?? "Unknown person"}</span><button className="app-pill" onClick={() => void removeIdentity(identity.id)}>Remove</button></div>;
            })}
          </div>
        </section>

        <section className="app-card app-panel">
          <p className="app-kpi-label">REGISTERED DEVICES</p>
          {devices.length === 0 ? <p>No attendance devices registered yet.</p> : <div style={{ display: "grid", gap: 10 }}>{devices.map((device) => <div key={device.id} style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr 1fr auto", gap: 12, alignItems: "center", border: "1px solid var(--app-line,#d7e0e0)", padding: 12, borderRadius: 12 }}><div><strong>{device.label}</strong><div>{device.deviceSerial}</div></div><span>{device.kind}</span><span>{device.status}{device.lastSeenAt ? ` · ${new Date(device.lastSeenAt).toLocaleString()}` : " · never seen"}</span>{device.status === "active" ? <button className="app-pill" onClick={() => void revokeDevice(device.id)}>Revoke</button> : <span className="app-pill">Revoked</span>}</div>)}</div>}
          {message ? <div className="app-banner" style={{ marginTop: 14 }}><p>{message}</p></div> : null}
        </section>
      </main>
    </AppShell>
  );
}
