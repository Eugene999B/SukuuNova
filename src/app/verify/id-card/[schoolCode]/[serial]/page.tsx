import { notFound } from "next/navigation";
import { publicIdentityCardBySerial } from "@/lib/identity-card-service";
import { rawDb } from "@/lib/db";

export default async function IdentityCardVerificationPage({
  params,
  searchParams
}: {
  params: Promise<{ schoolCode: string; serial: string }>;
  searchParams: Promise<{ sig?: string }>;
}) {
  const { schoolCode, serial } = await params;
  const { sig } = await searchParams;
  const code = schoolCode.trim().toLowerCase();
  const directory = await rawDb.schoolLoginDirectory.findUnique({ where: { uniqueCode: code }, select: { schoolId: true, status: true } });
  if (!directory || directory.status !== "active" || !sig) notFound();

  const result = await publicIdentityCardBySerial(directory.schoolId, serial, sig);
  if (!result) notFound();

  const verified = result.state === "verified";
  const schoolName = result.school.name;

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-xl">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="bg-slate-950 px-6 py-7 text-white sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">SukuuNova identity verification</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{result.card.personName}</h1>
            <p className="mt-1 text-sm text-slate-300">{result.card.personType === "student" ? "Student" : "Staff"} · {schoolName}</p>
          </div>
          <div className="space-y-6 p-6 sm:p-8">
            <div className={`rounded-2xl border p-4 ${verified ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <p className={`text-sm font-bold ${verified ? "text-emerald-800" : "text-amber-800"}`}>
                {verified ? "Identity card verified" : result.state === "revoked" ? "Identity card revoked" : result.state === "expired" ? "Identity card expired" : "Person is no longer active"}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {verified ? "This credential is currently active and the QR signature matches SukuuNova." : "Do not rely on this credential as current proof of authorization."}
              </p>
            </div>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">School</dt><dd className="mt-1 font-semibold">{schoolName}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Card serial</dt><dd className="mt-1 break-all font-mono text-sm">{result.card.serial}</dd></div>
              {result.card.personType === "student" ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admission number</dt><dd className="mt-1 font-semibold">{result.card.admissionNo ?? "Not available"}</dd></div> : null}
              {result.card.personType === "student" ? <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Class</dt><dd className="mt-1 font-semibold">{result.card.className ?? "Not assigned"}</dd></div> : null}
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issued</dt><dd className="mt-1 font-semibold">{result.card.issuedAt.toISOString().slice(0, 10)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expires</dt><dd className="mt-1 font-semibold">{result.card.expiresAt.toISOString().slice(0, 10)}</dd></div>
            </dl>
            <p className="border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">This page verifies a SukuuNova school credential. It is not a national identity document and does not replace the school’s own safeguarding or access-control procedures.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
