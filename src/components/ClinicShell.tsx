import Link from "next/link";
import { HeartPulse, LockKeyhole, ShieldCheck } from "lucide-react";
import { LogoutButton } from "./LogoutButton";

export function ClinicShell({ schoolName, schoolCode, userName, role, children }: {
  schoolName: string;
  schoolCode: string;
  userName: string;
  role: string;
  children: React.ReactNode;
}) {
  return <div className="clinic-shell">
    <header className="clinic-shell-nav clinic-no-print sticky top-0 z-40">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-900 text-white shadow-sm"><HeartPulse size={21} /></div>
          <div className="min-w-0"><div className="truncate text-sm font-black tracking-tight text-slate-950">{schoolName} · Clinic</div><div className="truncate text-xs text-slate-500">{userName} · {role} · {schoolCode}</div></div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 md:flex"><ShieldCheck size={14} /> Clinical workspace</span>
          <Link href="/account/security" className="hidden rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 sm:block" aria-label="Account security"><LockKeyhole size={17} /></Link>
          <LogoutButton universe="school" />
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] px-4 py-5 md:px-6 md:py-7">{children}</main>
  </div>;
}
