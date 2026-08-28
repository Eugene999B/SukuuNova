import Link from "next/link";
import "./home.css";

const highlights = [
  ["School operations", "One place for academics, attendance, fees, staff, transport and more."],
  ["Family visibility", "Give parents clear access to the information that matters about their children."],
  ["Built for Ghana", "A practical school platform shaped around local workflows and real school needs."],
];

export default function HomePage() {
  return (
    <main className="home-shell">
      <div className="home-wrap">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">S</div>
            <span>SukuuNova</span>
          </div>
          <div className="top-note">School management, built to grow with your school.</div>
        </header>

        <section className="hero">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> Smart school operations</div>
            <h1>Run your school with <span>clarity.</span></h1>
            <p className="hero-copy">
              SukuuNova brings the everyday work of a modern school into one secure platform — from the office and classroom to parents, transport and finance.
            </p>

            <div className="actions">
              <Link className="entry" href="/login/school">
                <span className="entry-label">School login</span>
                <span className="entry-copy">For owners, principals, teachers, staff and other school users.</span>
                <span className="entry-arrow">Continue →</span>
              </Link>
              <Link className="entry" href="/login/platform">
                <span className="entry-label">Platform admin</span>
                <span className="entry-copy">For SukuuNova platform operators and support administrators.</span>
                <span className="entry-arrow">Open console →</span>
              </Link>
            </div>
          </div>

          <div className="visual" aria-hidden="true">
            <div className="panel main-card">
              <div className="card-title">SukuuNova overview</div>
              <div className="card-big">Everything in one place.</div>
              <div className="mini-grid">
                <div className="mini"><span>Daily operations</span><strong>Connected</strong></div>
                <div className="mini"><span>Family access</span><strong>Clear</strong></div>
                <div className="mini"><span>Security</span><strong>Tenant-safe</strong></div>
                <div className="mini"><span>Growth</span><strong>Ready</strong></div>
              </div>
            </div>
            <div className="panel float-card">
              <div className="float-head">For school teams</div>
              <div className="float-main">Less chasing.</div>
              <div className="float-sub">Keep records, people and decisions moving in one system.</div>
            </div>
            <div className="panel float-card bottom">
              <div className="float-head">For parents</div>
              <div className="float-main">More visibility.</div>
              <div className="float-sub">Important updates without the usual back-and-forth.</div>
            </div>
          </div>
        </section>

        <section className="trust">
          {highlights.map(([title, copy]) => (
            <div className="trust-item" key={title}>
              <strong>{title}</strong>
              {copy}
            </div>
          ))}
        </section>

        <footer className="footer">Secure multi-tenant school software for Ghanaian schools.</footer>
      </div>
    </main>
  );
}
