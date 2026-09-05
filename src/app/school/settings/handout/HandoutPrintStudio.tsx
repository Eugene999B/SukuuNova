/* eslint-disable @next/next/no-img-element */
"use client";

import type { CSSProperties } from "react";

export type HandoutModule = { key: string; label: string; description: string };

export type HandoutIdentity = {
  name: string;
  uniqueCode: string;
  logoUrl: string | null;
  primary: string;
  accent: string;
  watermark: string;
};

export default function HandoutPrintStudio({
  identity,
  generatedDate,
  planName,
  modules,
  supportContact,
}: {
  identity: HandoutIdentity;
  generatedDate: string;
  planName: string;
  modules: HandoutModule[];
  supportContact: string;
}) {
  const style = {
    "--handout-primary": identity.primary,
    "--handout-accent": identity.accent,
  } as CSSProperties;

  return (
    <div className="sn-handout" style={style}>
      <section className="sn-handout-sheet" aria-label="SukuuNova school handout">
        <div className="sn-handout-cover">
          <div className="sn-handout-cover-watermark" aria-hidden="true">{identity.watermark}</div>
          <div className="sn-handout-brand">
            {identity.logoUrl ? (
              <img src={identity.logoUrl} alt={`${identity.name} logo`} />
            ) : (
              <span aria-hidden="true">{identity.name.slice(0, 1).toUpperCase()}</span>
            )}
            <div>
              <small>SUKUUNOVA</small>
              <strong>{identity.name}</strong>
              <em>School code · {identity.uniqueCode || "Not configured"}</em>
            </div>
          </div>

          <div className="sn-handout-cover-copy">
            <span className="sn-handout-eyebrow">WELCOME TO SUKUUNOVA</span>
            <h1>Welcome to SukuuNova</h1>
            <p className="sn-handout-dek">A practical guide for {identity.name}</p>
            <p>
              If you&apos;re reading this, you&apos;ve just taken on one of the busiest jobs there is — running a school.
              This handout is here to make one small part of that job easier: knowing what SukuuNova can do for you,
              and where to find it, without having to click through every menu to figure it out yourself.
            </p>
            <p className="sn-handout-keep">Keep this somewhere handy. Print it, pin it in the staff room, or just save it to your computer. It&apos;s yours.</p>
          </div>

          <div className="sn-handout-meta-grid">
            <div><span>School code</span><strong>{identity.uniqueCode || "Not configured"}</strong></div>
            <div><span>Plan</span><strong>{planName}</strong></div>
            <div><span>Generated</span><strong>{generatedDate}</strong></div>
          </div>
        </div>

        <section className="sn-handout-section">
          <div className="sn-handout-section-heading"><span>01</span><div><small>THE BIG PICTURE</small><h2>What SukuuNova actually is</h2></div></div>
          <p>
            Think of SukuuNova as the one place where everything about running {identity.name} day to day comes together —
            who&apos;s in class today, how each child is doing, who owes what in fees, when the bus is arriving, and how to reach
            a parent in two minutes instead of two days.
          </p>
          <p>You don&apos;t need to be good with computers to use it. If you can use WhatsApp, you can use this.</p>
        </section>

        <section className="sn-handout-section">
          <div className="sn-handout-section-heading"><span>02</span><div><small>ACCOUNT STRUCTURE</small><h2>Your account and who sees what</h2></div></div>
          <p>
            You, as the Owner, can see everything happening at {identity.name}. Every other login — your teachers, your accountant,
            your front desk staff, your parents — sees only what&apos;s relevant to their part of the work. A subject teacher sees their own
            classes. A parent sees only their own child. Nobody accidentally stumbles into a part of the system that isn&apos;t theirs, and
            you decide exactly who gets access to what, right down to the individual permission, from Settings.
          </p>
          <p>
            If a staff member leaves or changes role, you&apos;re the one who switches their access off or updates it — takes a minute, and it happens instantly.
          </p>
        </section>

        <section className="sn-handout-section">
          <div className="sn-handout-section-heading"><span>03</span><div><small>EVERYDAY WORK</small><h2>The everyday things you&apos;ll use most</h2></div></div>
          <div className="sn-handout-feature-list">
            <article><b>Keeping track of who&apos;s in school.</b><p>Every morning, attendance gets recorded — either by a teacher marking a register, or through the gate-scanning system if your school has it turned on. The moment a child is marked present or absent, their parent knows too.</p></article>
            <article><b>Scores and report cards.</b><p>Teachers enter class scores and exam results through the term. When it&apos;s time for report cards, they&apos;re built automatically from those records — no retyping anything — and go through a simple approval step before anything reaches a parent, so nothing goes out with a mistake in it. Once approved, report cards land straight in the parent&apos;s account, and you can send an SMS or WhatsApp letting them know it&apos;s ready.</p></article>
            <article><b>Fees, in plain terms.</b><p>You set up what each class owes for the term, and the system tracks who&apos;s paid, who&apos;s partial, and who&apos;s still owing — no more digging through a paper ledger to answer “has this family paid?” in the middle of a conversation.</p></article>
            <article><b>Talking to parents.</b><p>Announcements, fee reminders, and attendance alerts go out by SMS or WhatsApp — whichever your parents actually check. No more relying on a child to pass along a note that never makes it home.</p></article>
          </div>

          {modules.length > 0 && (
            <div className="sn-handout-plan-modules">
              <div>
                <span className="sn-handout-pill">YOUR PLAN · {planName}</span>
                <h3>Also included for {identity.name}</h3>
              </div>
              <div className="sn-handout-module-grid">
                {modules.map((module) => (
                  <article key={module.key}>
                    <b>{module.label}</b>
                    <p>{module.description}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="sn-handout-section">
          <div className="sn-handout-section-heading"><span>04</span><div><small>FOR YOUR TEAM</small><h2>For your staff</h2></div></div>
          <p>
            Every teacher, accountant, and staff member gets their own login, scoped to their own job. Teachers see their assigned classes
            and nothing else. Your accountant sees the finances, not the gradebook. You can build custom roles too, if the standard ones don&apos;t
            quite match how your school is organized — Settings → Roles &amp; Permissions is where that lives.
          </p>
          <p>
            Staff payroll, if you&apos;re using it, works the same way — each staff member can log in and see their own payslip, without you having to hand
            out paper copies or field “how much did I get paid” questions individually.
          </p>
        </section>

        <section className="sn-handout-section">
          <div className="sn-handout-section-heading"><span>05</span><div><small>TRUST &amp; CONTROL</small><h2>Keeping things safe</h2></div></div>
          <p>
            Every meaningful action in the system — who approved a report card, who recorded a payment, who changed someone&apos;s access — is quietly logged
            in the background. If a question ever comes up about what happened and when, that record is there. You&apos;re never just trusting that everyone remembers correctly.
          </p>
          <p>
            Your data belongs to {identity.name} alone. No other school on the platform can see it, and no one at SukuuNova looks at it without a clear, logged reason tied to actually helping you.
          </p>
        </section>

        <section className="sn-handout-support">
          <div>
            <span className="sn-handout-pill">NEED A HAND?</span>
            <h2>If something isn&apos;t working, or you&apos;re stuck</h2>
          </div>
          <p>
            You don&apos;t need to figure everything out alone. Reach out through <strong>{supportContact}</strong> and someone will help you directly, not send you into a maze of automated menus.
          </p>
        </section>

        <section className="sn-handout-section sn-handout-closing">
          <div className="sn-handout-section-heading"><span>06</span><div><small>FROM THE TEAM</small><h2>One last thing</h2></div></div>
          <p>
            Software is only useful if it actually makes your week easier, not more complicated. If something about SukuuNova is getting in your way instead of helping, tell us — that&apos;s exactly the kind of thing that gets fixed.
          </p>
          <p>Welcome aboard. We built this for schools like yours.</p>
          <p className="sn-handout-signoff">— The SukuuNova Team</p>
        </section>

        <footer className="sn-handout-footer">
          <div><strong>{identity.name}</strong><span>{identity.uniqueCode || "School code not configured"}</span></div>
          <div><span>Plan · {planName}</span><span>Generated · {generatedDate}</span></div>
          <div aria-hidden="true">{identity.watermark}</div>
        </footer>
      </section>

      <div className="sn-handout-actions">
        <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
        <button type="button" className="secondary" onClick={() => window.history.back()}>Back to School Settings</button>
      </div>
    </div>
  );
}
