import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import SignatureProfileEditor from "./SignatureProfileEditor";
import "./signature.css";

export default async function SignatureProfilePage() {
  const session = await requireSchoolSession();
  const school = await withTenant(session.schoolId, (tx) => tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }));
  if (!school) return null;
  return (
    <AppShell universe="school" title="My Signature" subtitle="Manage your document signature." active="School Settings" schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}>
      <main className="signature-page">
        <header className="signature-page-header">
          <div>
            <span className="signature-page-kicker">DOCUMENT SIGNATURE</span>
            <h1>Sign once, then keep issued documents stable.</h1>
            <p>Draw your signature with a mouse, touchscreen or stylus. Schools can select you as a report-card signatory, but only your account can replace the signature saved here.</p>
          </div>
        </header>
        <SignatureProfileEditor />
      </main>
    </AppShell>
  );
}
