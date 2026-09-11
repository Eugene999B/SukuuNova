/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { rawDb, withTenant } from "@/lib/db";
import {
  identityCardSignature,
  publicIdentityCardBySerial,
} from "@/lib/identity-card-service";
import { verifyIdentityCardCompactToken } from "@/lib/identity-card-compact-verification";

export const dynamic = "force-dynamic";

type CanonicalCard = {
  schoolId: string;
  serial: string;
  personType: "student" | "staff";
  issuedAt: Date;
  expiresAt: Date;
  version: number;
};

function brand(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const safe = (candidate: unknown, fallback: string) => typeof candidate === "string" && /^#?[0-9a-f]{6}$/i.test(candidate)
    ? (candidate.startsWith("#") ? candidate : `#${candidate}`)
    : fallback;
  return {
    primary: safe(row.primary ?? row.primaryColor, "#08263d"),
    accent: safe(row.accent ?? row.secondary, "#13b8a6"),
  };
}

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "SN";
}

function displayDate(value: Date) {
  return value.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function CompactIdentityCardVerificationPage({
  params,
}: {
  params: Promise<{ schoolCode: string; serial: string; token: string }>;
}) {
  const { schoolCode, serial, token } = await params;
  const code = schoolCode.trim().toLowerCase();
  const directory = await rawDb.schoolLoginDirectory.findUnique({
    where: { uniqueCode: code },
    select: { schoolId: true, status: true },
  });
  if (!directory || directory.status !== "active") notFound();

  const candidate = await withTenant(directory.schoolId, async (tx) => {
    const rows = await tx.$queryRawUnsafe<CanonicalCard[]>(
      `SELECT "schoolId","serial","personType","issuedAt","expiresAt","version"
       FROM "IdentityCard"
       WHERE "schoolId"=$1 AND "serial"=$2
       LIMIT 1`,
      directory.schoolId,
      serial,
    );
    const school = await tx.school.findUnique({
      where: { id: directory.schoolId },
      select: { name: true, uniqueCode: true, logoUrl: true, brandColors: true },
    });
    return rows[0] && school ? { card: rows[0], school } : null;
  });
  if (!candidate || !verifyIdentityCardCompactToken(candidate.card, token)) notFound();

  const result = await publicIdentityCardBySerial(
    directory.schoolId,
    serial,
    identityCardSignature(candidate.card),
  );
  if (!result) notFound();

  const palette = brand(candidate.school.brandColors);
  const style = { "--verify-primary": palette.primary, "--verify-accent": palette.accent } as CSSProperties;
  const verified = result.state === "verified";
  const statusTitle = verified
    ? "VERIFIED LIVE"
    : result.state === "revoked"
      ? "CARD REVOKED"
      : result.state === "expired"
        ? "CARD EXPIRED"
        : "HOLDER INACTIVE";
  const holderId = result.card.personNumber || result.card.admissionNo || result.card.serial;
  const roleLine = result.card.personType === "student"
    ? result.card.className || "Class not assigned"
    : result.card.roleName || "Staff member";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-7 text-slate-950 sm:px-6 sm:py-12" style={style}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
          SukuuNova secure credential check
        </div>

        <section className="overflow-hidden rounded-[30px] border border-white/15 bg-white shadow-2xl">
          <header className="relative overflow-hidden px-6 py-6 text-white sm:px-8" style={{ background: "var(--verify-primary)" }}>
            <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full border border-white/10" aria-hidden="true" />
            <div className="absolute -right-5 -top-8 h-36 w-36 rounded-full border border-white/10" aria-hidden="true" />
            <div className="relative flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/30 bg-white text-lg font-black" style={{ color: "var(--verify-primary)" }}>
                {candidate.school.logoUrl ? <img src={candidate.school.logoUrl} alt="" className="h-full w-full object-contain p-1" /> : initials(candidate.school.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--verify-accent)" }}>Official school credential</p>
                <h1 className="mt-1 truncate text-2xl font-black tracking-tight sm:text-3xl">{candidate.school.name}</h1>
                <p className="mt-1 text-sm text-white/70">School code · {candidate.school.uniqueCode}</p>
              </div>
            </div>
          </header>

          <div className="h-1.5" style={{ background: "var(--verify-accent)" }} />

          <div className="p-5 sm:p-8">
            <div className={`mb-7 rounded-2xl border p-4 ${verified ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg font-black ${verified ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                  {verified ? "✓" : "!"}
                </div>
                <div>
                  <p className={`text-sm font-black tracking-[0.08em] ${verified ? "text-emerald-800" : "text-rose-800"}`}>{statusTitle}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    {verified
                      ? "The QR signature is authentic and this credential is active in SukuuNova right now."
                      : "The QR signature is authentic, but this credential must not be treated as a current active school ID."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-[132px_1fr] sm:items-start">
              <div className="mx-auto w-[132px] sm:mx-0">
                <div className="aspect-[4/5] overflow-hidden rounded-2xl border-2 bg-slate-100 shadow-sm" style={{ borderColor: "var(--verify-accent)" }}>
                  {result.card.photoUrl
                    ? <img src={result.card.photoUrl} alt={`${result.card.personName} portrait`} className="h-full w-full object-cover" />
                    : <div className="grid h-full place-items-center text-3xl font-black" style={{ color: "var(--verify-primary)" }}>{initials(result.card.personName)}</div>}
                </div>
                <div className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  {result.card.personType === "student" ? "Student" : "Staff"}
                </div>
              </div>

              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Credential holder</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{result.card.personName}</h2>
                <div className="mt-3 h-1 w-20 rounded-full" style={{ background: "var(--verify-accent)" }} />

                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{result.card.personType === "student" ? "Student ID" : "Staff ID"}</dt><dd className="mt-1 break-all text-base font-black" style={{ color: "var(--verify-primary)" }}>{holderId}</dd></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{result.card.personType === "student" ? "Class" : "Role / position"}</dt><dd className="mt-1 text-base font-bold text-slate-900">{roleLine}</dd></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Issued</dt><dd className="mt-1 font-bold text-slate-900">{displayDate(result.card.issuedAt)}</dd></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Valid until</dt><dd className="mt-1 font-bold text-slate-900">{displayDate(result.card.expiresAt)}</dd></div>
                </dl>
              </div>
            </div>

            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Credential serial</span>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-slate-500 shadow-sm">LIVE DATABASE CHECK</span>
              </div>
              <p className="mt-2 break-all font-mono text-xs font-semibold text-slate-700">{result.card.serial}</p>
            </div>

            <p className="mt-6 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
              This page verifies a school-issued SukuuNova credential against its live school record. It is not a Ghana Card, ECOWAS national identity card or other government identity document.
            </p>
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-slate-400">For safeguarding or access-control decisions, use the live status shown above rather than visual inspection of the printed card alone.</p>
      </div>
    </main>
  );
}
