"use client";

/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileImage, LoaderCircle, ShieldCheck } from "lucide-react";
import { identityCardQrSvgDataUri } from "@/lib/identity-card-qr";
import { identityCardTheme } from "@/lib/identity-card-themes";
import "./identity-card-preview.css";
import "./identity-card-theme-preview.css";

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

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "identity-card";
}

function responseFilename(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  return disposition.match(/filename="([^"]+)"/i)?.[1] || fallback;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function IdentityCardPreview({ school, card, downloadHref, verifyHref }: Props) {
  const theme = identityCardTheme(school.brandColors);
  const style = {
    "--id-primary": theme.primary,
    "--id-accent": theme.accent,
    "--id-gold": theme.highlight,
    "--id-paper": theme.frontBackground,
    "--id-back-paper": theme.backBackground,
    "--id-theme-ink": theme.ink,
    "--id-theme-muted": theme.muted,
    "--id-theme-surface": theme.surface,
    "--id-theme-surface-alt": theme.surfaceAlt,
    "--id-theme-line": theme.line,
    "--id-theme-footer": theme.footer,
    "--id-theme-footer-ink": theme.footerInk,
    "--id-theme-portrait": theme.portraitBorder,
  } as CSSProperties;
  const [downloading, setDownloading] = useState<"pdf" | "front" | "back" | null>(null);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const current = card.status === "active" && !card.isExpired;
  const schoolId = card.personNumber || card.admissionNo || card.serial;
  const roleLine = card.personType === "student"
    ? [card.className, card.houseName].filter(Boolean).join(" · ") || "Class not assigned"
    : card.roleName || "Staff member";
  const contactLabel = card.personType === "student" ? "Guardian / emergency" : "Contact";
  const contactName = card.personType === "student" ? (card.guardianName || "School office") : (card.contactPhone || "School office");
  const contactValue = card.personType === "student" ? (card.guardianPhone || "Contact the school office") : (card.contactEmail || "School staff account");
  const qrDataUri = identityCardQrSvgDataUri(absoluteVerificationUrl(verifyHref));

  async function downloadAsset(kind: "pdf" | "front" | "back") {
    const href = kind === "pdf" ? downloadHref : formatHref(downloadHref, kind);
    setDownloading(kind);
    setDownloadStatus("");
    setDownloadError("");
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || body.error || "Unable to prepare this identity card.");
      }
      const blob = await response.blob();
      const fallback = kind === "pdf"
        ? `${safeFilename(card.personName)}-identity-card-front-back.pdf`
        : `${safeFilename(card.personName)}-identity-card-${kind}.svg`;
      saveBlob(blob, responseFilename(response, fallback));
      setDownloadStatus(kind === "pdf" ? "Two-sided CR80 PDF downloaded." : `${kind === "front" ? "Front" : "Back"} vector artwork downloaded.`);
    } catch (reason) {
      setDownloadError(reason instanceof Error ? reason.message : "Unable to prepare this identity card.");
    } finally {
      setDownloading(null);
    }
  }

  return <section className="identity-profile-card-wrap" style={style} data-id-theme={theme.key}>
    <div className="identity-profile-print-note">
      <div><strong>{theme.name} · CR80 school credential</strong><span>Front + Back · 85.60 × 53.98 mm · print at 100% / Actual Size</span></div>
      <small>The selected school theme controls previews, PDF/SVG artwork and bulk sheets. The back carries a high-contrast QR that opens the live holder verification page.</small>
    </div>

    <div className="identity-profile-sides">
      <div className="identity-profile-side">
        <div className="identity-profile-side-label"><strong>Front</strong><span>Holder identity · school number · validity</span></div>
        <article className="identity-profile-card identity-front-card">
          <div className="identity-security-orbits" aria-hidden="true" />
          <header className="identity-profile-card-head">
            <div className="identity-school-mark">{school.logoUrl ? <img src={school.logoUrl} alt="" /> : <span>{initials(school.name)}</span>}</div>
            <div className="identity-issuer-copy"><strong>{school.name}</strong><small>{card.personType === "student" ? "STUDENT IDENTITY CARD" : "STAFF IDENTITY CARD"}</small></div>
            <span className="identity-kind-chip">{card.personType === "student" ? "STUDENT" : "STAFF"}</span>
          </header>
          <div className="identity-accent-bar" />
          <div className="identity-card-main identity-card-front-main">
            <div className="identity-portrait">{card.photoUrl ? <img src={card.photoUrl} alt={`${card.personName} portrait`} /> : <span>{initials(card.personName)}</span>}</div>
            {card.photoUrl ? <div className="identity-ghost-portrait" aria-hidden="true"><img src={card.photoUrl} alt=""/></div> : null}
            <div className="identity-card-person">
              <h3>{card.personName}</h3>
              <i />
              <span>{card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</span>
              <strong>{schoolId}</strong>
              <small>{card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION"}</small>
              <p>{roleLine}</p>
              <small>CREDENTIAL NO.</small>
              <code>{card.serial}</code>
            </div>
          </div>
          <footer className="identity-card-foot">
            <div><small>ISSUED</small><strong>{date(card.issuedAt)}</strong></div>
            <div><small>VALID UNTIL</small><strong>{date(card.expiresAt)}</strong></div>
            <span className={current ? "is-current" : "is-invalid"}>{current ? "ACTIVE" : card.status === "revoked" ? "REVOKED" : "EXPIRED"}</span>
            <div className="identity-verified-mark"><small>SUKUUNOVA</small><b>VERIFIED SCHOOL ID</b></div>
          </footer>
        </article>
      </div>

      <div className="identity-profile-side">
        <div className="identity-profile-side-label"><strong>Back</strong><span>Live QR verification · contact · return</span></div>
        <article className="identity-profile-card identity-back-card">
          <div className="identity-security-orbits" aria-hidden="true" />
          <header className="identity-profile-card-head identity-back-head">
            <div className="identity-school-mark">{school.logoUrl ? <img src={school.logoUrl} alt="" /> : <span>{initials(school.name)}</span>}</div>
            <div className="identity-issuer-copy"><strong>{school.name}</strong><small>LIVE CREDENTIAL VERIFICATION</small></div>
          </header>
          <div className="identity-accent-bar" />
          <div className="identity-back-main">
            <div className="identity-back-details">
              <span>{card.personType === "student" ? "STUDENT ID" : "STAFF ID"}</span><strong>{schoolId}</strong>
              <span>{card.personType === "student" ? "CLASS / HOUSE" : "ROLE / POSITION"}</span><strong>{roleLine}</strong>
              <span>{contactLabel}</span><strong>{contactName}</strong><small>{contactValue}</small>
              <div className="identity-signature-row"><div className="identity-signature-line"><i/><b>AUTHORISED SIGNATURE</b></div><em>School code · {school.uniqueCode}</em></div>
            </div>
            <Link className="identity-card-qr" href={verifyHref} target="_blank"><img src={qrDataUri} alt="QR code for live ID verification"/><b>SCAN · VERIFY LIVE</b><small>Official holder + live status</small></Link>
          </div>
          <footer className="identity-back-foot">If found, return to {school.name}. Scan the QR for the official live holder record.</footer>
        </article>
      </div>
    </div>

    <div className="identity-profile-actions">
      <button type="button" className="button primary" disabled={Boolean(downloading)} onClick={() => void downloadAsset("pdf")}>{downloading === "pdf" ? <LoaderCircle className="identity-preview-spin" size={15}/> : <Download size={15}/>} {downloading === "pdf" ? "Preparing PDF…" : "PDF · front + back"}</button>
      <button type="button" className="button secondary" disabled={Boolean(downloading)} onClick={() => void downloadAsset("front")}>{downloading === "front" ? <LoaderCircle className="identity-preview-spin" size={15}/> : <FileImage size={15}/>} {downloading === "front" ? "Preparing…" : "Front SVG"}</button>
      <button type="button" className="button secondary" disabled={Boolean(downloading)} onClick={() => void downloadAsset("back")}>{downloading === "back" ? <LoaderCircle className="identity-preview-spin" size={15}/> : <FileImage size={15}/>} {downloading === "back" ? "Preparing…" : "Back SVG"}</button>
      <Link className="button secondary" href={verifyHref} target="_blank"><ShieldCheck size={15}/> Verify live</Link>
      {!card.photoReady ? <span className="identity-photo-warning">Add a captured portrait for the best printed ID.</span> : null}
    </div>
    {downloadStatus ? <div className="identity-preview-download-status is-success"><CheckCircle2 size={14}/>{downloadStatus}</div> : null}
    {downloadError ? <div className="identity-preview-download-status is-error">{downloadError}</div> : null}
  </section>;
}