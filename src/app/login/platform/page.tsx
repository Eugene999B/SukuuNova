import Link from "next/link";
import { Building2, ChartNoAxesCombined, ShieldCheck, LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";
import "../login.css";
import "../../platform-auth.css";

export default function PlatformLoginPage() {
  return <main className="auth-shell platform-login-shell">
    <section className="auth-visual">
      <div className="auth-orbit" /><div className="auth-grid" />
      <div className="auth-preview"><div className="auth-preview-top"><span>SukuuNova · Network control</span><span><LockKeyhole size={11} aria-hidden="true" /> Secure</span></div><div className="auth-preview-main">Platform command center</div><div className="auth-preview-kpis"><div className="auth-preview-kpi"><b>Network</b><span>Schools</span></div><div className="auth-preview-kpi"><b>People</b><span>Learners</span></div><div className="auth-preview-kpi"><b>Health</b><span>Platform</span></div><div className="auth-preview-kpi"><b>Cases</b><span>Support</span></div></div></div>
      <div className="auth-copy"><div className="auth-kicker"><span className="auth-dot" /> SukuuNova platform control</div><h2>Operate the network with <span>clarity and control.</span></h2><p>Manage schools, subscriptions, support, security, system health and platform-wide reporting from one secure command center.</p><div className="auth-feature-grid"><div className="auth-feature"><strong><Building2 size={14} aria-hidden="true" /> School network</strong><span>Onboard, support and govern every school workspace.</span></div><div className="auth-feature"><strong><ShieldCheck size={14} aria-hidden="true" /> Security</strong><span>Audited access, permissions and platform activity.</span></div><div className="auth-feature"><strong><ChartNoAxesCombined size={14} aria-hidden="true" /> Intelligence</strong><span>Network health, growth, finance and operational insight.</span></div></div></div>
    </section>
    <section className="auth-form-pane"><div className="auth-panel"><Link href="/" className="auth-brand"><span className="auth-brand-mark">S</span><span><strong>SukuuNova</strong><small>Platform command center</small></span></Link><div className="auth-context platform"><LockKeyhole size={12} aria-hidden="true" /> Platform administrator</div><div className="auth-heading"><h1>Welcome, operator.</h1><p>Use your administrator credentials to enter the SukuuNova control plane.</p></div><LoginForm universe="platform" /><div className="auth-divider">Secure environment</div><div className="auth-secondary"><Link href="/">← Back to home</Link><Link href="/login/school">School login</Link></div><div className="auth-foot">Protected administrator access · All sensitive actions are audited · <Link href="/">SukuuNova</Link></div></div></section>
  </main>;
}
