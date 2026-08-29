import Link from "next/link";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";

export default async function PerformancePage() {
  const session = await requireSchoolSession();
  const context = await withTenant(session.schoolId, async (tx) => {
    const [classes, subjects, terms] = await Promise.all([
      tx.class.findMany({ select: { id: true, name: true, level: true }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
      tx.subject.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.term.findMany({ select: { id: true, name: true, startDate: true, endDate: true }, orderBy: { startDate: "desc" }, take: 12 })
    ]);
    return { classes, subjects, terms };
  });

  return (
    <main style={{ minHeight: "100vh", background: "#07121b", color: "#edf8f5", padding: 24 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 20, marginBottom: 24 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".14em", color: "#62dfba" }}>PERFORMANCE STUDIO</span>
            <h1 style={{ fontSize: 42, letterSpacing: "-.05em", margin: "8px 0" }}>Understand the class, not just the marks.</h1>
            <p style={{ color: "#82979b", maxWidth: 760, lineHeight: 1.6 }}>Choose a class, subject and term to see the same calculated results used by the gradebook and future report cards. The aim is to spot missing work, strong performance and students who need help before the term closes.</p>
          </div>
          <Link href="/school/gradebook/studio" style={{ color: "#7de3c2", fontWeight: 800 }}>Open Gradebook →</Link>
        </div>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 18 }}>
          {[
            ["Class", context.classes.length, "Configured class groups"],
            ["Subjects", context.subjects.length, "School subject catalogue"],
            ["Terms", context.terms.length, "Recent academic periods"]
          ].map(([label, value, detail]) => (
            <div key={String(label)} style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, padding: 18, background: "rgba(255,255,255,.025)" }}>
              <small style={{ color: "#7f9699" }}>{label}</small>
              <strong style={{ display: "block", fontSize: 32, marginTop: 6 }}>{value}</strong>
              <span style={{ color: "#6f8589", fontSize: 12 }}>{detail}</span>
            </div>
          ))}
        </section>

        <section style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 20, padding: 20, background: "rgba(255,255,255,.025)" }}>
          <h2 style={{ marginTop: 0 }}>Start a performance review</h2>
          <p style={{ color: "#7f9699" }}>The data API is ready for class-subject performance. Select a context to open the live analysis endpoint.</p>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(3, 1fr)" }}>
            <select aria-label="Class"><option>Choose class…</option>{context.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select aria-label="Subject"><option>Choose subject…</option>{context.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select aria-label="Term"><option>Choose term…</option>{context.terms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </div>
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {["Class average", "Highest score", "Incomplete", "Needs attention"].map((label) => <div key={label} style={{ border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: 14 }}><small style={{ color: "#789094" }}>{label}</small><strong style={{ display: "block", marginTop: 5, fontSize: 22 }}>—</strong></div>)}
          </div>
        </section>
      </div>
    </main>
  );
}
