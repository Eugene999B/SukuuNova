/* eslint-disable @next/next/no-img-element */
import * as React from "react";

type VerificationCard = {
  personType: "student" | "staff";
  personName: string | null;
  personNumber?: string | null;
  admissionNo: string | null;
  className: string | null;
  roleName: string | null;
  photoUrl: string | null;
  serial: string;
  issuedAt: Date;
  expiresAt: Date;
};

type SchoolVerificationBrand = {
  name: string;
  uniqueCode: string;
  logoUrl: string | null;
  brandColors: unknown;
};

type Props = {
  school: SchoolVerificationBrand;
  card: VerificationCard;
  state: "verified" | "revoked" | "expired" | "inactive";
};

type FailureProps = {
  school?: SchoolVerificationBrand | null;
  serial?: string | null;
  reason: string;
};

function brand(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const safe = (candidate: unknown, fallback: string) => typeof candidate === "string" && /^#?[0-9a-f]{6}$/i.test(candidate)
    ? (candidate.startsWith("#") ? candidate : `#${candidate}`)
    : fallback;
  return {
    primary: safe(row.primary ?? row.primaryColor, "var(--identity-ink)"),
    accent: safe(row.accent ?? row.secondary, "var(--color-brand)"),
  };
}

function initials(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "SN";
}

function displayDate(value: Date | null | undefined) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "Not available";
  return value.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function verifiedAt() {
  return new Date().toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Accra",
  });
}

function VerificationShell({ school, children }: { school?: SchoolVerificationBrand | null; children: React.ReactNode }) {
  const palette = brand(school?.brandColors);
  const style = { "--verify-primary": palette.primary, "--verify-accent": palette.accent } as React.CSSProperties;
  const schoolName = school?.name || "SukuuNova School Credential";
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-7 text-slate-950 sm:px-6 sm:py-12" style={style}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
          <span className="h-2 w-2 rounded-full bg-teal-300" aria-hidden="true" />
          SukuuNova live credential verification
        </div>
        <section className="overflow-hidden rounded-[30px] border border-white/15 bg-white shadow-2xl">
          <header className="relative overflow-hidden px-6 py-6 text-white sm:px-8" style={{ background: "var(--verify-primary)" }}>
            <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full border border-white/10" aria-hidden="true" />
            <div className="absolute -right-5 -top-8 h-36 w-36 rounded-full border border-white/10" aria-hidden="true" />
            <div className="relative flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/30 bg-white text-lg font-black" style={{ color: "var(--verify-primary)" }}>
                {school?.logoUrl ? <img src={school.logoUrl} alt="" className="h-full w-full object-contain p-1" /> : initials(schoolName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--verify-accent)" }}>Official school credential check</p>
                <h1 className="mt-1 truncate text-2xl font-black tracking-tight sm:text-3xl">{schoolName}</h1>
                <p className="mt-1 text-sm text-white/70">{school?.uniqueCode ? `School code · ${school.uniqueCode}` : "Public verification centre"}</p>
              </div>
            </div>
          </header>
          <div className="h-1.5" style={{ background: "var(--verify-accent)" }} />
          {children}
        </section>
        <p className="mt-5 text-center text-xs leading-5 text-slate-400">This is the official SukuuNova live verification view. Printed appearance alone is never treated as proof of current validity.</p>
      </div>
    </main>
  );
}

export function PublicIdentityCardVerification({ school, card, state }: Props) {
  const verified = state === "verified";
  const holderName = card.personName?.trim() || "Credential holder";
  const statusTitle = verified
    ? "VALID — VERIFIED CURRENT CREDENTIAL"
    : state === "revoked"
      ? "INVALID — CREDENTIAL REVOKED"
      : state === "expired"
        ? "INVALID — CREDENTIAL EXPIRED"
        : "INVALID — HOLDER INACTIVE";
  const holderId = card.personNumber || card.admissionNo || card.serial;
  const roleLine = card.personType === "student"
    ? card.className || "Class not assigned"
    : card.roleName || "Staff member";
  const statusCopy = verified
    ? "The signed QR is authentic and this holder is currently active in the issuing school's SukuuNova record."
    : "The QR is authentic, but this printed credential is not a current valid school ID and must not be accepted as one.";

  return (
    <VerificationShell school={school}>
      <div className="p-5 sm:p-8">
        <div className={`mb-7 rounded-2xl border p-4 ${verified ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`} role="status">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl font-black ${verified ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
              {verified ? "✓" : "!"}
            </div>
            <div>
              <p className={`text-sm font-black tracking-[0.08em] ${verified ? "text-emerald-800" : "text-rose-800"}`}>{statusTitle}</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{statusCopy}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">Live database check · {verifiedAt()} GMT</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-[145px_1fr] sm:items-start">
          <div className="mx-auto w-[145px] sm:mx-0">
            <div className="aspect-[4/5] overflow-hidden rounded-2xl border-2 bg-slate-100 shadow-sm" style={{ borderColor: "var(--verify-accent)" }}>
              {card.photoUrl
                ? <img src={card.photoUrl} alt={`${holderName} portrait`} className="h-full w-full object-cover" />
                : <div className="grid h-full place-items-center text-3xl font-black" style={{ color: "var(--verify-primary)" }}>{initials(holderName)}</div>}
            </div>
            <div className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              {card.personType === "student" ? "Student credential" : "Staff credential"}
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Verified credential holder</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{holderName}</h2>
            <div className="mt-3 h-1 w-20 rounded-full" style={{ background: "var(--verify-accent)" }} />

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{card.personType === "student" ? "Student ID" : "Staff ID"}</dt><dd className="mt-1 break-all text-base font-black" style={{ color: "var(--verify-primary)" }}>{holderId}</dd></div>
              <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{card.personType === "student" ? "Class" : "Role / position"}</dt><dd className="mt-1 text-base font-bold text-slate-900">{roleLine}</dd></div>
              <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Issued</dt><dd className="mt-1 font-bold text-slate-900">{displayDate(card.issuedAt)}</dd></div>
              <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Valid until</dt><dd className="mt-1 font-bold text-slate-900">{displayDate(card.expiresAt)}</dd></div>
            </dl>
          </div>
        </div>

        <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Credential serial</span>
            <span className={`rounded-full bg-white px-3 py-1 text-[10px] font-bold shadow-sm ${verified ? "text-emerald-700" : "text-rose-700"}`}>
              {verified ? "VALID · SIGNED QR · LIVE RECORD" : "NOT VALID · SIGNED QR · LIVE RECORD"}
            </span>
          </div>
          <p className="mt-2 break-all font-mono text-xs font-semibold text-slate-700">{card.serial}</p>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600">
          <strong className="text-slate-900">What this verifies:</strong> the printed credential's signed QR, issuing school, named holder, school identifier, role/class, current card state and validity dates against the live school record.
        </div>
      </div>
    </VerificationShell>
  );
}

export function PublicIdentityCardVerificationFailure({ school, serial, reason }: FailureProps) {
  return (
    <VerificationShell school={school}>
      <div className="p-5 sm:p-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5" role="alert">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-600 text-xl font-black text-white">!</div>
            <div>
              <p className="text-sm font-black tracking-[0.08em] text-rose-800">INVALID / UNVERIFIED CREDENTIAL</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{reason}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">Checked · {verifiedAt()} GMT</p>
            </div>
          </div>
        </div>
        {serial ? <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Scanned credential serial</p><p className="mt-2 break-all font-mono text-xs font-semibold text-slate-700">{serial}</p></div> : null}
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Do not rely on this printed card for access or safeguarding decisions. Ask the issuing school to reprint the current ID card from SukuuNova and scan the new QR.
        </div>
      </div>
    </VerificationShell>
  );
}
