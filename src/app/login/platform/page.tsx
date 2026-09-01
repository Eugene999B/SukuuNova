import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";
import "../login.css";
import "../../platform-auth.css";

export default function PlatformLoginPage() {
  return (
    <main className="auth-shell platform-login-shell">
      <section className="auth-visual">
        <div className="auth-copy">
          <div className="auth-kicker"><span className="auth-dot" /> Platform administration</div>
          <h2>Run the network with <span>clarity and control.</span></h2>
          <p>Manage schools, support, access and platform operations from one secure control centre.</p>
          <div className="auth-feature-grid">
            <div className="auth-feature"><strong><ShieldCheck size={14} aria-hidden="true" /> Secure administration</strong><span>Controlled access and audited sensitive actions.</span></div>
            <div className="auth-feature"><strong><LockKeyhole size={14} aria-hidden="true" /> Protected environment</strong><span>Keep platform operations separate from school workspaces.</span></div>
          </div>
        </div>
      </section>
      <section className="auth-form-pane">
        <div className="auth-panel">
          <Link href="/" className="auth-brand"><span className="auth-brand-mark">S</span><span><strong>SukuuNova</strong><small>Platform administration</small></span></Link>
          <div className="auth-context platform"><LockKeyhole size={12} aria-hidden="true" /> Platform administrator</div>
          <div className="auth-heading"><h1>Welcome back</h1><p>Sign in to manage the SukuuNova platform.</p></div>
          <LoginForm universe="platform" />
          <div className="auth-divider">Other access</div>
          <div className="auth-secondary"><Link href="/">Back to SukuuNova</Link><Link href="/login/school">School login</Link></div>
          <p className="auth-foot">Platform actions are protected and audited.</p>
        </div>
      </section>
    </main>
  );
}
