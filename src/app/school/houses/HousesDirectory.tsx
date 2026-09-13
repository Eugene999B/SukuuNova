"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { CheckCircle2, Plus, RefreshCw, Users } from "lucide-react";
import { assignHouse, autoBalanceHouses, createHouse } from "@/app/school/classes/actions";
import "../classes/classes-houses-simple.css";

type House = { id: string; name: string; code: string; color: string | null; description: string | null; active: boolean; students: number };
type Learner = { id: string; name: string; admissionNo: string; className: string | null; houseId: string | null; houseName: string | null };

export function HousesDirectory({ houses, learners }: { houses: House[]; learners: Learner[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [studentId, setStudentId] = useState("");
  const [houseId, setHouseId] = useState("");
  const unassigned = useMemo(() => learners.filter((learner) => !learner.houseId), [learners]);

  function refreshSoon(messageText: string) {
    setMessage(messageText);
    setTimeout(() => window.location.reload(), 550);
  }

  function submitHouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createHouse({
        name: String(form.get("name") ?? ""),
        code: String(form.get("code") ?? ""),
        description: String(form.get("description") ?? ""),
      });
      setMessage(result.message);
      if (result.ok) refreshSoon(result.message);
    });
  }

  function balance() {
    startTransition(async () => {
      const result = await autoBalanceHouses();
      setMessage(result.message);
      if (result.ok) refreshSoon(result.message);
    });
  }

  function assign() {
    if (!studentId || !houseId) { setMessage("Choose a learner and a house first."); return; }
    startTransition(async () => {
      const result = await assignHouse({ studentId, houseId });
      setMessage(result.message);
      if (result.ok) refreshSoon(result.message);
    });
  }

  return <div className="classroom-page classroom-simple">
    {message ? <div className="inline-result success" role="status"><span>{message}</span></div> : null}
    <header className="classroom-hero"><div><div className="eyebrow">People · House system</div><h2>Houses</h2><p>Cross-class pastoral and activity groups belong with people, not academic class setup.</p></div><div className="hero-stats"><div><strong>{houses.length}</strong><span>Houses</span></div><div><strong>{learners.length - unassigned.length}</strong><span>Assigned</span></div><div><strong>{unassigned.length}</strong><span>Unassigned</span></div></div></header>

    <section className="house-simple-head"><div><h3>House directory</h3><p>Open a house to see its active members.</p></div><div className="house-simple-actions"><button className="secondary" type="button" disabled={pending || !houses.length} onClick={balance}><RefreshCw size={15}/> Auto-assign unassigned</button></div></section>
    <section className="house-simple-grid">{houses.map((house) => <article className="house-simple-card" key={house.id}><span className="house-simple-strip" style={{ background: house.color || "var(--sn-primary)" }}/><div className="house-simple-title"><span className="house-simple-mark" style={{ background: house.color || "var(--sn-primary)" }}>{house.code}</span><div><span>HOUSE</span><strong>{house.name}</strong></div><b>{house.students}</b></div><div className="house-simple-foot"><span>{house.active ? "Active" : "Inactive"} · {house.students} learners</span><Link href={`/school/houses/${house.id}`}>Open →</Link></div></article>)}{houses.length === 0 ? <div className="empty-panel"><Users size={20}/><h4>No houses yet</h4><p>Create the school&apos;s first house below.</p></div> : null}</section>

    <section className="class-simple-panel"><div className="class-simple-head"><h3>Assign a learner</h3><span>{unassigned.length} currently unassigned</span></div><div className="form-grid" style={{ padding: 16 }}><label>Learner<select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Choose learner</option>{learners.map((learner) => <option key={learner.id} value={learner.id}>{learner.name} · {learner.admissionNo}{learner.houseName ? ` · ${learner.houseName}` : ""}</option>)}</select></label><label>House<select value={houseId} onChange={(event) => setHouseId(event.target.value)}><option value="">Choose house</option>{houses.filter((house) => house.active).map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label><div style={{ display: "flex", alignItems: "end" }}><button className="primary" type="button" disabled={pending || !houses.length} onClick={assign}><CheckCircle2 size={15}/> Assign house</button></div></div></section>

    <form className="class-simple-panel" onSubmit={submitHouse}><div className="class-simple-head"><h3>Create house</h3><span>School identity and community</span></div><div className="form-grid" style={{ padding: 16 }}><label>House name<input name="name" required placeholder="e.g. Eagles" /></label><label>Code<input name="code" required maxLength={8} placeholder="EAG" /></label><label className="wide">Description<textarea name="description" rows={2} placeholder="Optional description" /></label><div className="wide"><button className="primary" disabled={pending}><Plus size={15}/> {pending ? "Saving…" : "Create house"}</button></div></div></form>
  </div>;
}
