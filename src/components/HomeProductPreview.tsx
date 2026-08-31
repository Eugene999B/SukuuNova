"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CircleCheck, Users, WalletCards } from "lucide-react";
import { useState } from "react";

const areas = [
  { label: "Students & families", copy: "Admissions, records and parent details.", detail: "Keep learner, guardian and admission information together so the school starts from one reliable record.", icon: Users, href: "/features/students-families", result: "A clearer learner and family record." },
  { label: "Teaching & learning", copy: "Classes, timetable, marks and reports.", detail: "Move from classes and lessons to marks and reports without rebuilding the same information in separate tools.", icon: BookOpen, href: "/features/academics", result: "Teaching work stays connected to learner records." },
  { label: "Attendance & safety", copy: "Daily attendance, absence and alerts.", detail: "Record attendance as the school day happens, follow absences and keep the right people informed.", icon: CircleCheck, href: "/features/attendance-safety", result: "Attendance becomes a working record, not a late report." },
  { label: "Fees & finance", copy: "Invoices, payments, balances and receipts.", detail: "Keep invoices, collections, balances and receipts together so finance questions can be answered from the same trail.", icon: WalletCards, href: "/features/fees-finance", result: "A clearer path from amount due to payment history." },
] as const;

export function HomeProductPreview() {
  const [active, setActive] = useState(0);
  const current = areas[active];
  const Icon = current.icon;

  return (
    <section className="home-product-preview" aria-label="SukuuNova school workspace overview">
      <div className="home-preview-window home-preview-window-interactive">
        <div className="home-preview-heading">
          <div>
            <span>Inside the school</span>
            <h3>{current.label}</h3>
            <p>{current.detail}</p>
          </div>
          <div className="home-preview-status" aria-live="polite">{active + 1} / {areas.length}</div>
        </div>

        <div className="home-preview-layout">
          <div className="home-preview-areas" role="tablist" aria-label="School work areas">
            {areas.map(({ label, copy, icon: AreaIcon }, index) => (
              <button
                type="button"
                key={label}
                className={`home-preview-area${active === index ? " is-active" : ""}`}
                role="tab"
                aria-selected={active === index}
                onClick={() => setActive(index)}
              >
                <span className="home-preview-area-icon"><AreaIcon size={18} aria-hidden="true" /></span>
                <span className="home-preview-area-copy"><strong>{label}</strong><small>{copy}</small></span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>

          <div className="home-preview-detail" key={current.label}>
            <div className="home-preview-detail-icon"><Icon size={20} aria-hidden="true" /></div>
            <span>What happens here</span>
            <strong>{current.result}</strong>
            <p>{current.detail}</p>
            <Link className="home-preview-detail-link" href={current.href}>Open {current.label} <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </div>

        <div className="home-preview-note">
          <span>Built for the real school day.</span>
          <small>Different people can work on the same school records without seeing what they should not.</small>
        </div>
      </div>
    </section>
  );
}
