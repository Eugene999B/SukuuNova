import Link from "next/link";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function TermCompletionPage() {
  const session = await requireSchoolSession();
  const terms = await withTenant(session.schoolId, (tx) => tx.term.findMany({ select: { id: true, name: true, startDate: true, endDate: true }, orderBy: { startDate: "desc" }, take: 8 }));
  return (
    <main style={{ minHeight: "100vh", background: "#07121b", color: "#edf8f5", padding: 24 }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <Link href="/school/academics/setup" style={{ color: "#7de3c2", fontWeight: 800 }}>← Academic setup</Link>
        <span style={{ display: "block", marginTop: 24, fontSize: 11, fontWeight: 900, letterSpacing: ".14em", color: "#62dfba" }}>TERM COMPLETION</span>
        <h1 style={{ fontSize: 42, letterSpacing: "-.05em", margin: "8px 0" }}>Finish the term with confidence.</h1>
        <p style={{ color: "#82979b", maxWidth: 780, lineHeight: 1.6 }}>Before reports go home, SukuuNova checks the academic chain for missing work, incomplete records and approval gaps. The school should fix the blockers, not discover them after publishing.</p>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 24 }}>
          <div style={{ borderRadius: 18, padding: 18, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.025)" }}><b>1</b><h3>Choose the term</h3><p style={{ color: "#778e92" }}>Use the latest or a historical term for review.</p></div>
          <div style={{ borderRadius: 18, padding: 18, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.025)" }}><b>2</b><h3>Run readiness</h3><p style={{ color: "#778e92" }}>Check classes, assignments, assessments, marks and reports.</p></div>
          <div style={{ borderRadius: 18, padding: 18, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.025)" }}><b>3</b><h3>Resolve & publish</h3><p style={{ color: "#778e92" }}>Clear blockers, approve reports and release them to families.</p></div>
        </section>
        <section style={{ marginTop: 18, borderRadius: 20, padding: 20, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
          <h2>Available terms</h2>
          {terms.length === 0 ? <p style={{ color: "#82979b" }}>No academic terms have been created yet.</p> : terms.map((term) => (
            <div key={term.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <div><b>{term.name}</b><span style={{ display: "block", color: "#71888c", fontSize: 12, marginTop: 4 }}>{new Date(term.startDate).toLocaleDateString()} – {new Date(term.endDate).toLocaleDateString()}</span></div>
              <a href={`/api/school/academics/term-readiness?termId=${encodeURIComponent(term.id)}`} style={{ color: "#7de3c2", fontWeight: 800 }}>Run readiness →</a>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
