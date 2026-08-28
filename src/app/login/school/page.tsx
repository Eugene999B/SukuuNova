import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import "../login.css";

export default function SchoolLoginPage() {
  return (
    <main className="login-shell">
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <section className="login-card">
        <div className="login-top">
          <Link href="/" className="login-brand"><span>S</span>SukuuNova</Link>
          <span className="login-pill">School</span>
        </div>
        <div className="login-heading">
          <p>Welcome back</p>
          <h1>Sign in to your school.</h1>
          <span>Access the tools and information for your school account.</span>
        </div>
        <LoginForm universe="school" />
        <div className="login-note"><span>●</span> Secure school access</div>
        <Link href="/" className="login-back">← Back to SukuuNova</Link>
      </section>
    </main>
  );
}
