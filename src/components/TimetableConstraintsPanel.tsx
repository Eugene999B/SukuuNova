"use client";

import { useState } from "react";

type Room = { id: string; name: string; type?: string };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TimetableConstraintsPanel(props: {
  teachers: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  initial: {
    rooms: Room[];
    teacherUnavailability: Record<string, string[]>;
    roomRequirements: Record<string, { roomType?: string; room?: string }>;
    doublePeriodSubjects: Record<string, number>;
  };
}) {
  const [rooms, setRooms] = useState<Room[]>(props.initial.rooms);
  const [unavail, setUnavail] = useState<Record<string, string[]>>(props.initial.teacherUnavailability);
  const [roomReq, setRoomReq] = useState(props.initial.roomRequirements);
  const [doubles, setDoubles] = useState<Record<string, number>>(props.initial.doublePeriodSubjects);
  const [roomName, setRoomName] = useState("");
  const [roomType, setRoomType] = useState("");
  const [unTeacher, setUnTeacher] = useState("");
  const [unDay, setUnDay] = useState("2");
  const [unPeriod, setUnPeriod] = useState("1");
  const [reqSubject, setReqSubject] = useState("");
  const [reqRoom, setReqRoom] = useState("");
  const [dblSubject, setDblSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty =
    JSON.stringify({ rooms, unavail, roomReq, doubles }) !==
    JSON.stringify({ rooms: props.initial.rooms, unavail: props.initial.teacherUnavailability, roomReq: props.initial.roomRequirements, doubles: props.initial.doublePeriodSubjects });

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const current = await (await fetch("/api/school/academic-engine")).json();
      const r = await fetch("/api/school/academic-engine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          timetable: {
            ...current.timetable,
            rooms,
            teacherUnavailability: unavail,
            roomRequirements: roomReq,
            doublePeriodSubjects: doubles,
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || d.error || "Could not save constraints.");
      setMessage("Scheduling constraints saved. The next auto-generation run will respect them.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save constraints.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tt-constraints" aria-label="Scheduling constraints">
      <div className="tt-constraints-head">
        <div>
          <span className="timetable-kicker">GENERATOR CONSTRAINTS</span>
          <h2>Rooms, availability & double periods</h2>
          <p>These rules are hard constraints for auto-generation and are re-checked on every manual edit. Leave a section empty to keep current behaviour.</p>
        </div>
        <button className="tt-button primary" type="button" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? "Saving…" : dirty ? "Save constraints" : "Saved"}
        </button>
      </div>
      {message ? <p role="status" className="tt-constraints-message">{message}</p> : null}
      <div className="tt-constraints-grid">
        <div className="tt-constraint-card">
          <h3>Rooms / venues ({rooms.length})</h3>
          <p>Named spaces the generator must never double-book, e.g. Science Lab.</p>
          <ul>
            {rooms.map((r) => (
              <li key={r.id}>
                {r.name}{r.type ? ` · ${r.type}` : ""}
                <button type="button" aria-label={`Remove ${r.name}`} onClick={() => setRooms(rooms.filter((x) => x.id !== r.id))}>×</button>
              </li>
            ))}
          </ul>
          <div className="tt-constraint-row">
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Room name" aria-label="Room name" maxLength={80} />
            <input value={roomType} onChange={(e) => setRoomType(e.target.value)} placeholder="Type, e.g. lab" aria-label="Room type" maxLength={60} />
            <button
              type="button"
              onClick={() => {
                const name = roomName.trim();
                if (!name) return;
                setRooms([...rooms, { id: `room-${Date.now().toString(36)}`, name, type: roomType.trim() || undefined }]);
                setRoomName("");
                setRoomType("");
              }}
            >
              Add
            </button>
          </div>
        </div>
        <div className="tt-constraint-card">
          <h3>Teacher unavailability</h3>
          <p>Day + period combinations a teacher can never be scheduled, e.g. part-time days.</p>
          <div className="tt-constraint-row">
            <select value={unTeacher} onChange={(e) => setUnTeacher(e.target.value)} aria-label="Teacher">
              <option value="">Teacher</option>
              {props.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={unDay} onChange={(e) => setUnDay(e.target.value)} aria-label="Day">
              {DAYS.map((d, i) => <option key={d} value={String(i + 1)}>{d}</option>)}
            </select>
            <select value={unPeriod} onChange={(e) => setUnPeriod(e.target.value)} aria-label="Period">
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={String(i + 1)}>P{i + 1}</option>)}
            </select>
            <button
              type="button"
              onClick={() => {
                if (!unTeacher) return;
                const key = `${unDay}:${unPeriod}`;
                const cur = unavail[unTeacher] ?? [];
                if (!cur.includes(key)) setUnavail({ ...unavail, [unTeacher]: [...cur, key] });
              }}
            >
              Block
            </button>
          </div>
          <ul>
            {Object.entries(unavail).map(([tid, slots]) => (
              <li key={tid}>
                {props.teachers.find((t) => t.id === tid)?.name ?? tid}: {slots.join(", ")}
                <button type="button" aria-label="Clear blocks" onClick={() => { const n = { ...unavail }; delete n[tid]; setUnavail(n); }}>×</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="tt-constraint-card">
          <h3>Room rules & double periods</h3>
          <p>Require a subject to use a room, and schedule science-style doubles as consecutive periods.</p>
          <div className="tt-constraint-row">
            <select value={reqSubject} onChange={(e) => setReqSubject(e.target.value)} aria-label="Subject for room rule">
              <option value="">Subject</option>
              {props.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={reqRoom} onChange={(e) => setReqRoom(e.target.value)} aria-label="Required room">
              <option value="">Room</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => {
                if (!reqSubject || !reqRoom) return;
                setRoomReq({ ...roomReq, [reqSubject]: { room: reqRoom } });
                setReqSubject("");
              }}
            >
              Require
            </button>
          </div>
          <div className="tt-constraint-row">
            <select value={dblSubject} onChange={(e) => setDblSubject(e.target.value)} aria-label="Subject for double periods">
              <option value="">Double-period subject</option>
              {props.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => {
                if (!dblSubject) return;
                setDoubles({ ...doubles, [dblSubject]: Math.min(5, (doubles[dblSubject] ?? 0) + 1) });
                setDblSubject("");
              }}
            >
              +1 double/week
            </button>
          </div>
          <ul>
            {Object.entries(roomReq).map(([sid, r]) => (
              <li key={sid}>
                {props.subjects.find((s) => s.id === sid)?.name ?? sid} → {rooms.find((x) => x.id === r.room)?.name ?? r.room}
                <button type="button" aria-label="Remove room rule" onClick={() => { const n = { ...roomReq }; delete n[sid]; setRoomReq(n); }}>×</button>
              </li>
            ))}
            {Object.entries(doubles).map(([sid, n]) => (
              <li key={sid}>
                {props.subjects.find((s) => s.id === sid)?.name ?? sid}: {n} double block{n === 1 ? "" : "s"}/week
                <button type="button" aria-label="Remove double periods" onClick={() => { const x = { ...doubles }; delete x[sid]; setDoubles(x); }}>×</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
