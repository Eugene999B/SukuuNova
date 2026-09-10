/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import Link from "next/link";
import { Download, QrCode, ShieldCheck } from "lucide-react";
import "./identity-card-preview.css";

type Props = {
  school: { name: string; uniqueCode: string; logoUrl: string | null; brandColors: unknown };
  card: {
    personType: "student" | "staff";
    personName: string;
    admissionNo: string | null;
    className: string | null;
    roleName: string | null;
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
    primary: safe(row.primary ?? row.primaryColor, "#102943"),
    accent: safe(row.accent ?? row.secondary, "#d9a629"),
  };
}

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "SN";
}

export function IdentityCardPreview({ school, card, downloadHref, verifyHref }: Props) {
  const palette = brand(school.brandColors);
  const style = { "--id-primary": palette.primary, "--id-accent": palette.accent } as CSSProperties;
  const current = card.status === "active" && !card.isExpired;
  const descriptor = card.personType === "student" ? (card.admissionNo || card.serial) : (card.roleName || "Staff member");
  const secondary = card.personType === "student" ? (card.className || "Class not assigned") : card.serial;

  return <section className="identity-profile-card-wrap">
    <div className="identity-profile-card" style={style}>
      <header className="identity-profile-card-head">
        <div className="identity-school-mark">
          {school.logoUrl ? <img src={school.logoUrl} alt="" /> : <span>{initials(school.name)}</span>}
        </div>
        <div><strong>{school.name}</strong><small>{card.personType === "student" ? "STUDENT IDENTIFICATION CARD" : "STAFF IDENTIFICATION CARD"}</small></div>
      </header>
      <div className="identity-accent-bar" />
      <div className="identity-card-main">
        <div className="identity-portrait">
          {card.photoUrl ? <img src={card.photoUrl} alt={`${card.personName} portrait`} /> : <span>{initials(card.personName)}</span>}
        </div>
        <div className="identity-card-person">
          <h3>{card.personName}</h3>
          <span>IDENTIFICATION</span>
          <strong>{descriptor}</strong>
          <small>{card.personType === "student" ? "CLASS" : "CARD SERIAL"}</small>
          <p>{secondary}</p>
        </div>
        <div className="identity-card-qr">
          <QrCode size={45} strokeWidth={1.25}/>
          <b>SCAN TO VERIFY</b>
        </div>
      </div>
      <footer className="identity-card-foot">
        <div><small>ISSUED</small><strong>{card.issuedAt.toISOString().slice(0, 10)}</strong></div>
        <div><small>EXPIRES</small><strong>{card.expiresAt.toISOString().slice(0, 10)}</strong></div>
        <span className={current ? "is-current" : "is-invalid"}>{current ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED"}</span>
      </footer>
    </div>
    <div className="identity-profile-actions">
      <a className="button primary" href={downloadHref}><Download size={15}/> Download / print ID</a>
      <Link className="button secondary" href={verifyHref} target="_blank"><ShieldCheck size={15}/> Open verification</Link>
      {!card.photoReady ? <span className="identity-photo-warning">Add a captured portrait for the best printed ID.</span> : null}
    </div>
  </section>;
}
