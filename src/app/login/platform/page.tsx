import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import "../login.css";

export default function PlatformLoginPage() {
  return (
    <main className="login-shell">
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <section className="login-card">
        <div className="login-top">
          <Link href="/" className="login-brand"><span>S</span>SukuuNova</Link>
          <span className="login-pill login-pill-dark">Platform</span>
        </div>
        <div className="login-heading">
          <p>Administrator access</p>
          <h1>Welcome to your console.</h1>
          <span>Sign in to manage SukuuNova schools, support and platform operations.</span>
        </div>
        <LoginForm universe="platform" />
        <div className="login-note"><span>●</span> Protected platform access</div>
        <Link href="/" className="login-back">← Back to SukuuNova</Link>
      </section>
    </main>
  );
}
