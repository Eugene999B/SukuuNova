"use client";

import { ArrowRight, LifeBuoy, MessageCircle, X } from "lucide-react";
import { useState } from "react";

const EMPTY_FORM = { name: "", email: "", phone: "", subject: "Help from SukuuNova", message: "" };

export function HomeHelpBar() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  async function send() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public/inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) setSent(true);
      else setError(body.message || "We could not send your message.");
    } catch {
      setError("We could not send your message. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function another() {
    setSent(false);
    setError("");
    setForm(EMPTY_FORM);
  }

  return (
    <section className={`home-help ${open ? "is-open" : ""}`}>
      <div className="home-help-summary">
        <div className="home-help-intro"><span className="home-help-icon"><LifeBuoy size={18} /></span><div><span className="home-help-kicker">Human support</span><strong>Need help deciding where to start?</strong><p>Tell us what your school needs. Send one message and give us either email or phone/WhatsApp so a real person can follow up.</p></div></div>
        <button type="button" className="home-help-open" onClick={() => { setOpen(true); setSent(false); }}><MessageCircle size={15} /> Send a help message <ArrowRight size={14} /></button>
      </div>

      {open ? <div className="home-help-panel">
        <div className="home-help-head"><div><span>Direct support</span><h2>Message SukuuNova</h2><p>Short is fine. Tell us the problem, question or goal.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close help form"><X size={18} /></button></div>
        {sent ? <div className="home-help-success"><strong>Your message is in the support inbox.</strong><p>We have the details you sent and a way to reply.</p><button type="button" onClick={another}>Send another message</button></div> : <div className="home-help-form">
          <label><span>Your name</span><input required placeholder="e.g. Ama Mensah" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label><span>Email</span><input type="email" placeholder="name@school.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label><span>Phone / WhatsApp</span><input placeholder="A number we can reply to" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label><span>What do you need?</span><input required placeholder="e.g. School setup, fees, attendance…" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label>
          <label className="home-help-message"><span>Message</span><textarea required placeholder="Describe the question or request…" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>
          <div className="home-help-submit"><button disabled={busy || !form.name || !form.subject || !form.message || (!form.email && !form.phone)} onClick={() => void send()}><MessageCircle size={14} />{busy ? "Sending…" : "Send help request"}</button><small>Only the information needed to understand and reply to your request.</small>{error ? <p role="alert">{error}</p> : null}</div>
        </div>}
      </div> : null}
    </section>
  );
}
