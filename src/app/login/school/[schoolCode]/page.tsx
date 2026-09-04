import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Building2, HeartHandshake, ShieldCheck, UsersRound } from "lucide-react";
import { PrismaClient } from "@prisma/client";
import { LoginForm } from "@/components/LoginForm";
import "../../login.css";
import "../gateway.css";
import "../../login-photo.css";

export default async function SchoolCodeLoginPage({ params }: { params: Promise<{ schoolCode: string }> }) {
  const { schoolCode: rawCode } = await params;
  const schoolCode = rawCode.trim().toLowerCase();
  if (!schoolCode) notFound();

  const db = new PrismaClient();
  try {
    const directory = await db.schoolLoginDirectory.findUnique({
      where: { uniqueCode: schoolCode },
      select: { schoolId: true, status: true },
    });
    if (!directory || directory.status !== "active") notFound();

    const school = await db.school.findUnique({
      where: { id: directory.schoolId },
      select: { name: true, status: true },
    });
    if (!school || school.status !== "active") notFound();

    return (
      <main className="auth-shell">
        <section className="auth-visual auth-photo-visual" aria-label="SukuuNova school access">
          <Image className="auth-photo-image" src="/brand/sukuu-school-login.jpeg" alt="A welcoming school environment" fill priority sizes="(max-width: 900px) 100vw, 54vw" />
          <div className="auth-photo-overlay" aria-hidden="true" />
          <div className="auth-copy">
            <div className="auth-kicker"><span className="auth-dot" /> School operations</div>
            <h2>Manage the school with <span>clarity.</span></h2>
            <p>Attendance, learning, people, communication and finance in one secure school workspace.</p>
            <div className="auth-feature-grid">
              <div className="auth-feature"><strong><UsersRound size={14} aria-hidden="true" /> For staff and teachers</strong><span>Get straight to the work assigned to you.</span></div>
              <div className="auth-feature"><strong><HeartHandshake size={14} aria-hidden="true" /> For families</strong><span>Guardians see the children and information connected to them.</span></div>
              <div className="auth-feature"><strong><ShieldCheck size={14} aria-hidden="true" /> Built for trust</strong><span>School records stay within the correct school workspace.</span></div>
            </div>
          </div>
        </section>

        <section className="auth-form-pane">
          <div className="auth-panel">
            <Link href="/" className="auth-brand" aria-label="SukuuNova home">
              <span className="auth-brand-mark">S</span>
              <span><strong>SukuuNova</strong><small>{school.name}</small></span>
            </Link>
            <div className="auth-context"><Building2 size={12} aria-hidden="true" /> School access · {schoolCode.toUpperCase()}</div>
            <div className="auth-heading">
              <h1>Welcome back</h1>
              <p>Sign in to manage attendance, learning and school operations in one place.</p>
            </div>
            <LoginForm universe="school" initialSchoolCode={schoolCode} />
            <div className="auth-divider">Need another door?</div>
            <div className="auth-secondary">
              <Link href="/">Back to SukuuNova</Link>
              <Link href="/login/platform">Platform access</Link>
            </div>
            <p className="auth-foot">Need help with access? <Link href="/contact">Contact support</Link>.</p>
          </div>
        </section>
      </main>
    );
  } finally {
    await db.$disconnect();
  }
}
