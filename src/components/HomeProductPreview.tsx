import Link from "next/link";
import { ArrowRight, BookOpen, CircleCheck, Users, WalletCards } from "lucide-react";

const areas = [
  { label: "Students & families", copy: "Admissions, records and parent details.", icon: Users, href: "/features/students-families" },
  { label: "Teaching & learning", copy: "Classes, timetable, marks and reports.", icon: BookOpen, href: "/features/academics" },
  { label: "Attendance & safety", copy: "Daily attendance, absence and alerts.", icon: CircleCheck, href: "/features/attendance-safety" },
  { label: "Fees & finance", copy: "Invoices, payments, balances and receipts.", icon: WalletCards, href: "/features/fees-finance" },
] as const;

export function HomeProductPreview() {
  return (
    <section className="home-product-preview" aria-label="SukuuNova school workspace overview">
      <div className="home-preview-window">
        <div className="home-preview-heading">
          <div>
            <span>Inside the school</span>
            <h3>Everything important, together.</h3>
            <p>One place for the people, teaching, attendance and money that keep a school moving.</p>
          </div>
        </div>
        <div className="home-preview-areas">
          {areas.map(({ label, copy, icon: Icon, href }) => (
            <Link href={href} className="home-preview-area" key={label}>
              <span className="home-preview-area-icon"><Icon size={18} aria-hidden="true" /></span>
              <span className="home-preview-area-copy"><strong>{label}</strong><small>{copy}</small></span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
        <div className="home-preview-note">
          <span>Built for the real school day.</span>
          <small>Different people can work on the same school records without seeing what they should not.</small>
        </div>
      </div>
    </section>
  );
}
