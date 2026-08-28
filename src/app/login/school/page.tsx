import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";

export default function SchoolLoginPage() {
  return (
    <main className="login-shell">
      <div className="login-orb login-orb-one" />
      <div className="login-orb login-orb-two" />
      <section className="login-card">
        <div className="login-brand-row">
          <Link href="/" className="login-brand"><span>S</span>SukuuNova</Link>
          <span className="login-badge">School workspace</span>
        </div>
        <div className="login-heading">
          <p className="login-eyebrow">Welcome back</p>
          <h1>Sign in to your school.</h1>
          <p>Use the school code and account details issued by your school administrator.</p>
        </div>
        <LoginForm universe="school" />
        <div className="login-footer"><span>Secure school access</span><Link href="/">Back to SukuuNova</Link></div>
      </section>
    </main>
  );
}
