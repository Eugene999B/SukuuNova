/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import Link from "next/link";
import { Download, FileImage, ShieldCheck } from "lucide-react";
import { identityCardQrSvgDataUri } from "@/lib/identity-card-output";
import "./identity-card-preview.css";

type Props = {
  school: { name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown };
  card: {
    personType: "student" | "staff";
    personName: string;
    personNumber?: string | null;
    admissionNo: string | null;
    className: string | null;
    houseName?: string | null;
    roleName: string | null;
    guardianName?: string | null;
    guardianPhone?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    photoUrl: string | null;
    serial: string;
    issuedAt: Date;
    expiresAt: Date;
    status: "active" | "revoked";
    isExpired: boolean;
    photoReady?: boolean;
  };
  downloadHref: string;
  verifyHref: string;
};

function brand(value: unknown) {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const safe = (candidate: unknown, fallback: string) => typeof candidate === "string" && /^#?[0-9a-f]{6}$/i.test(candidate) ? (candidate.startsWith("#") ? candidate : `#${candidate}`) : fallback;
  return {
    primary: safe(row.primary ?? row.primaryColor, "var(--sn-primary-deep)"),
    accent: safe(row.accent ?? row.secondary, "var(--sn-warning)"),
  };
}

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "SN";
}

function date(value: Date) {
  return value.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function absoluteVerificationUrl(href: string) {
  if (/^https:\/\//i.test(href)) return href;
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://sukuunova-production.up.railway.app").replace(/\/+$/g, "");
  return `${origin}${href.startsWith("/") ? href : `/${href}`}`;
}

function formatHref(base: string, side: "front" | "back") {
  return `${base}${base.includes("?") ? "&" : "?"}format=svg&side=${side}`;
}

export function IdentityCardPreview({ school, card, downloadHref, verifyHref }: Props) {
  const palette = brand(school.brandColors);
  const style = { "--id-primary": palette.primary, "--id-accent": palette.accent } as CSSProperties;
  const current = card.status === "active" && !card.isExpired;
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const roleLine = card.personType === "student"
    ? [card.className, card.houseName].filter(Boolean).join(" · ") || "Class not assigned"
    : card.roleName || "Staff member";
  const contactLabel = card.personType === "student" ? "Guardian / emergency" : "School contact";
  const contactName = card.personType === "student" ? (card.guardianName || "School office") : (card.contactPhone || "School office");
  const contactValue = card.personType === "student" ? (card.guardianPhone || "Contact the school office") : (card.contactEmail || "Staff account");
  const qrDataUri = identityCardQrSvgDataUri(absoluteVerificationUrl(verifyHref));

  return <section className="identity-profile-card-wrap">
    <div className="identity-profile-print-note">
      <div><strong>CR80 print preview</strong><span>Both sides are part of the same credential · 85.60 × 53.98 mm</span></div>
      <small>For direct printing, use the two-page PDF at 100% / Actual Size. SVG is provided for print shops that prefer vector artwork.</small>
    </div>

    <div className="identity-profile-sides" style={style}>
      <div className="identity-profile-side">
        <div className="identity-profile-side-label"><strong>Front</strong><span>Identity + portrait</span></div>
        <article className="identity-profile-card identity-front-card">
          <header className="identity-profile-card-head">
            <div className="identity-school-mark">{school.logoUrl ? <img src={school.logoUrl} alt="" /> : <span>{initials(school.name)}</span>}</div>
            <div><strong>{school.name}</strong><small>{card.personType === "student" ? "STUDENT IDENTIFICATION CARD" : "STAFF IDENTIFICATION CARD"}</small></div>
          </header>
          <div className="identity-accent-bar" />
          <div className="identity-card-main identity-card-front-main">
            <div className="identity-portrait">{card.photoUrl ? <img src={card.photoUrl} alt={`${card.personName} portrait`} /> : <span>{initials(card.personName)}</span>}</div>
            <div className="identity-card-person">
              <h3>{card.personName}</h3>
              <span>{card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</span>
              <strong>{schoolId}</strong>
              <small>{card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION"}</small>
              <p>{roleLine}</p>
              <small>CARD NO.</small>
              <code>{card.serial}</code>
            </div>
          </div>
          <footer className="identity-card-foot">
            <div><small>ISSUED</small><strong>{date(card.issuedAt)}</strong></div>
            <div><small>VALID UNTIL</small><strong>{date(card.expiresAt)}</strong></div>
            <span className={current ? "is-current" : "is-invalid"}>{current ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED"}</span>
          </footer>
        </article>
      </div>

      <div className="identity-profile-side">
        <div className="identity-profile-side-label"><strong>Back</strong><span>Verification + return information</span></div>
        <article className="identity-profile-card identity-back-card">
          <header className="identity-profile-card-head identity-back-head">
            <div className="identity-school-mark">{school.logoUrl ? <img src={school.logoUrl} alt="" /> : <span>{initials(school.name)}</span>}</div>
            <div><strong>{school.name}</strong><small>SECURE ID · SCAN TO VERIFY</small></div>
          </header>
          <div className="identity-accent-bar" />
          <div className="identity-back-main">
            <div className="identity-back-details">
              <span>{card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</span><strong>{schoolId}</strong>
              <span>{card.personType === "student" ? "CLASS / HOUSE" : "ROLE"}</span><strong>{roleLine}</strong>
              <span>{contactLabel}</span><strong>{contactName}</strong><small>{contactValue}</small>
              <div className="identity-signature-line"><i/><b>AUTHORISED SIGNATURE</b></div>
            </div>
            <Link className="identity-card-qr" href={verifyHref} target="_blank"><img src={qrDataUri} alt="QR code for live ID verification"/><b>SCAN TO VERIFY</b><small>Live status · authenticity</small></Link>
          </div>
          <footer className="identity-back-foot">If found, please return this card to {school.name}. School code: {school.uniqueCode}. Not a national identity document.</footer>
        </article>
      </div>
    </div>

    <div className="identity-profile-actions">
      <a className="button primary" href={downloadHref}><Download size={15}/> PDF · front + back</a>
      <a className="button secondary" href={formatHref(downloadHref, "front")}><FileImage size={15}/> Front SVG</a>
      <a className="button secondary" href={formatHref(downloadHref, "back")}><FileImage size={15}/> Back SVG</a>
      <Link className="button secondary" href={verifyHref} target="_blank"><ShieldCheck size={15}/> Open verification</Link>
      {!card.photoReady ? <span className="identity-photo-warning">Add a captured portrait for the best printed ID.</span> : null}
    </div>
  </section>;
}
