/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

export type SchoolIdentityData = {
  name: string;
  uniqueCode: string;
  logoUrl: string | null;
  motto: string | null;
  postalAddress: string | null;
  physicalAddress: string | null;
  town: string | null;
  district: string | null;
  region: string | null;
  country: string;
  email: string | null;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  website: string | null;
  locationText: string | null;
  departmentName: string | null;
  identifierLabel: string;
  documentFooter: string | null;
};

type Editable = Omit<SchoolIdentityData, "name" | "uniqueCode" | "logoUrl">;

const fields: Array<{ key: keyof Editable; label: string; placeholder: string; wide?: boolean }> = [
  { key: "motto", label: "School motto", placeholder: "e.g. Knowledge, Discipline, Service", wide: true },
  { key: "postalAddress", label: "Postal address", placeholder: "P. O. Box ..." },
  { key: "physicalAddress", label: "Physical address", placeholder: "Street / community / landmark", wide: true },
  { key: "town", label: "Town / city", placeholder: "Kumasi" },
  { key: "district", label: "District / municipality", placeholder: "District" },
  { key: "region", label: "Region / state", placeholder: "Ashanti Region" },
  { key: "country", label: "Country", placeholder: "Ghana" },
  { key: "email", label: "Official email", placeholder: "school@example.com" },
  { key: "phonePrimary", label: "Primary telephone", placeholder: "+233 ..." },
  { key: "phoneSecondary", label: "Secondary telephone", placeholder: "+233 ..." },
  { key: "website", label: "Website", placeholder: "www.school.edu.gh" },
  { key: "locationText", label: "Location line", placeholder: "Abuakwa – Canan", wide: true },
  { key: "departmentName", label: "Department / section", placeholder: "Primary / JHS / SHS" },
  { key: "identifierLabel", label: "Learner ID label", placeholder: "Admission No. / Index No." },
  { key: "documentFooter", label: "Official document footer", placeholder: "Optional accreditation / contact statement", wide: true },
];

export default function SchoolIdentityEditor({ initial }: { initial: SchoolIdentityData }) {
  const [form, setForm] = useState<Editable>({
    motto: initial.motto,
    postalAddress: initial.postalAddress,
    physicalAddress: initial.physicalAddress,
    town: initial.town,
    district: initial.district,
    region: initial.region,
    country: initial.country,
    email: initial.email,
    phonePrimary: initial.phonePrimary,
    phoneSecondary: initial.phoneSecondary,
    website: initial.website,
    locationText: initial.locationText,
    departmentName: initial.departmentName,
    identifierLabel: initial.identifierLabel,
    documentFooter: initial.documentFooter,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/school/settings/identity", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || "Unable to save school identity.");
      setMessage("Official school identity saved. New report cards and school documents will use these details.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save school identity.");
    } finally { setBusy(false); }
  };

  return (
    <div className="identity-page">
      <style>{styles}</style>
      <section className="identity-hero">
        <div className="identity-mark">{initial.logoUrl ? <img src={initial.logoUrl} alt="School crest" /> : <span>{initial.name.slice(0, 1)}</span>}</div>
        <div>
          <span className="identity-kicker">OFFICIAL DOCUMENT IDENTITY</span>
          <h1>{initial.name}</h1>
          <p>These details are the institutional source of truth for report cards and future official documents. Changes affect new issues only; approved reports keep their frozen historical identity.</p>
        </div>
        <div className="identity-code"><small>School code</small><strong>{initial.uniqueCode}</strong></div>
      </section>

      <section className="identity-sheet">
        <div className="identity-sheet-head">
          <div><span>School letterhead details</span><h2>What families should see on an official report</h2></div>
          <button type="button" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save official identity"}</button>
        </div>
        <div className="identity-grid">
          {fields.map((field) => (
            <label key={field.key} className={field.wide ? "wide" : ""}>
              <span>{field.label}</span>
              <input value={form[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value || null }))} />
            </label>
          ))}
        </div>
        <div className="identity-note"><strong>Logo / crest</strong><span>The existing school logo remains the official crest source. The report-card engine combines it with the identity above at approval time.</span></div>
        {message ? <div className="identity-message" role="status">{message}</div> : null}
      </section>
    </div>
  );
}

const styles = `
.identity-page{max-width:1180px;margin:0 auto;padding:24px;display:grid;gap:18px;color:var(--color-text-primary)}
.identity-hero{display:grid;grid-template-columns:88px 1fr auto;gap:18px;align-items:center;padding:24px;border:1px solid var(--color-border);border-radius:22px;background:var(--color-surface)}
.identity-mark{width:76px;height:76px;border:1px solid var(--color-border);border-radius:18px;display:grid;place-items:center;background:var(--color-bg);overflow:hidden;font-size:28px;font-weight:900}.identity-mark img{width:100%;height:100%;object-fit:contain;padding:8px}
.identity-kicker,.identity-sheet-head span{font-size:10px;font-weight:900;letter-spacing:.14em;color:var(--color-text-muted)}.identity-hero h1{margin:5px 0;font-size:30px;letter-spacing:-.03em}.identity-hero p{margin:0;max-width:760px;color:var(--color-text-secondary);line-height:1.7;font-size:13px}.identity-code{padding:12px 15px;border-left:1px solid var(--color-border);display:grid;gap:4px}.identity-code small{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--color-text-muted)}
.identity-sheet{border:1px solid var(--color-border);border-radius:22px;background:var(--color-surface);overflow:hidden}.identity-sheet-head{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 22px;border-bottom:1px solid var(--color-border)}.identity-sheet-head h2{margin:4px 0 0;font-size:18px}.identity-sheet-head button{border:0;border-radius:11px;padding:11px 15px;background:var(--color-brand);color:#fff;font-weight:900;cursor:pointer}.identity-sheet-head button:disabled{opacity:.55;cursor:not-allowed}
.identity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:22px}.identity-grid label{display:grid;gap:6px}.identity-grid label.wide{grid-column:1/-1}.identity-grid label span{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--color-text-muted)}.identity-grid input{height:44px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-bg);color:var(--color-text-primary);padding:0 12px;font:inherit;outline:none}.identity-grid input:focus{border-color:var(--color-brand)}
.identity-note{margin:0 22px 22px;padding:13px 15px;border-radius:12px;background:var(--color-bg);display:grid;gap:3px}.identity-note strong{font-size:11px}.identity-note span{font-size:11px;line-height:1.6;color:var(--color-text-secondary)}.identity-message{margin:0 22px 22px;padding:12px 14px;border:1px solid var(--color-border);border-radius:10px;font-size:12px;font-weight:700}
@media(max-width:760px){.identity-hero{grid-template-columns:64px 1fr}.identity-mark{width:58px;height:58px}.identity-code{grid-column:1/-1;border-left:0;border-top:1px solid var(--color-border)}.identity-grid{grid-template-columns:1fr}.identity-grid label.wide{grid-column:auto}.identity-sheet-head{align-items:flex-start;flex-direction:column}}
`;
