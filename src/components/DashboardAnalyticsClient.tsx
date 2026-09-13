"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  GraduationCap,
  Landmark,
  School,
  Users,
  VenusAndMars,
  WalletCards,
} from "lucide-react";
import "./dashboard-analytics.css";

type Point = { label: string; value: number };

type LeadershipPayload = {
  mode: "leadership" | "staff";
  school?: { name: string; uniqueCode: string } | null;
  summary: {
    students: number;
    staff: number;
    teachers: number;
    classes: number;
    assessments: number;
    studentsOwing: number;
    expected: number;
    collected: number;
    outstanding: number;
    collectionRate: number;
    attendanceToday: number;
    attendanceRate: number;
  };
  classPopulation: Point[];
  attendanceTrend: Point[];
  staffRoles: Point[];
  gender: { available: boolean; male: number | null; female: number | null; notRecorded: number };
};

type FinancePayload = {
  mode: "finance";
  school?: { name: string; uniqueCode: string } | null;
  summary: {
    expected: number;
    collected: number;
    outstanding: number;
    collectionRate: number;
    studentsOwing: number;
    paymentsToday: number;
    paymentsWeek: number;
    invoiceCount: number;
    paymentCount: number;
  };
  paymentMethods: Point[];
  arrears: Point[];
};

type TeacherPayload = {
  mode: "teacher";
  school?: { name: string; uniqueCode: string } | null;
  summary: {
    classes: number;
    subjects: number;
    students: number;
    assessments: number;
    pendingMarking: number;
    todayLessons: number;
    messages: number;
  };
  assessmentTypes: Point[];
  classPerformance: Point[];
  lessonsByDay: Point[];
};

type Payload = LeadershipPayload | FinancePayload | TeacherPayload;

type IconType = typeof Users;

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GH").format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(value);
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function Stat({ icon: Icon, label, value, detail, href }: { icon: IconType; label: string; value: string; detail: string; href?: string }) {
  const content = <>
    <span className="dash-analytics-stat-icon"><Icon size={17} aria-hidden="true" /></span>
    <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
  </>;
  return href ? <Link className="dash-analytics-stat" href={href}>{content}</Link> : <article className="dash-analytics-stat">{content}</article>;
}

function HorizontalBars({ points, suffix = "", empty = "No data yet." }: { points: Point[]; suffix?: string; empty?: string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  if (!points.length) return <div className="dash-analytics-empty">{empty}</div>;
  return <div className="dash-bars">
    {points.map((point) => <div className="dash-bar-row" key={point.label}>
      <div className="dash-bar-meta"><span>{point.label}</span><strong>{formatNumber(point.value)}{suffix}</strong></div>
      <div className="dash-bar-track"><i style={{ width: `${Math.max(3, (point.value / max) * 100)}%` }} /></div>
    </div>)}
  </div>;
}

function Ring({ percentValue, center, label }: { percentValue: number; center: string; label: string }) {
  const value = clamp(percentValue);
  return <div className="dash-ring-wrap">
    <div className="dash-ring" style={{ "--ring-value": `${value * 3.6}deg` } as React.CSSProperties}>
      <div><strong>{center}</strong><span>{label}</span></div>
    </div>
  </div>;
}

function Trend({ points, total }: { points: Point[]; total?: number }) {
  const max = Math.max(1, total || 0, ...points.map((point) => point.value));
  const width = 520;
  const height = 150;
  const pad = 14;
  const coords = points.map((point, index) => {
    const x = points.length <= 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = height - pad - (point.value / max) * (height - pad * 2);
    return { ...point, x, y };
  });
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(" ");
  return <div className="dash-trend">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Seven day attendance trend">
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="dash-trend-axis" />
      {total ? <line x1={pad} y1={height - pad - (total / max) * (height - pad * 2)} x2={width - pad} y2={height - pad - (total / max) * (height - pad * 2)} className="dash-trend-target" /> : null}
      <polyline points={polyline} className="dash-trend-line" />
      {coords.map((point) => <circle key={point.label} cx={point.x} cy={point.y} r="4" className="dash-trend-dot"><title>{`${point.label}: ${point.value}`}</title></circle>)}
    </svg>
    <div className="dash-trend-labels">{points.map((point) => <span key={point.label}><b>{point.value}</b><small>{point.label}</small></span>)}</div>
  </div>;
}

function Panel({ eyebrow, title, children, href, linkLabel = "Open" }: { eyebrow: string; title: string; children: React.ReactNode; href?: string; linkLabel?: string }) {
  return <section className="dash-analytics-panel">
    <div className="dash-analytics-panel-head"><div><span>{eyebrow}</span><h3>{title}</h3></div>{href ? <Link href={href}>{linkLabel}</Link> : null}</div>
    {children}
  </section>;
}

function LeadershipView({ data }: { data: LeadershipPayload }) {
  const s = data.summary;
  return <div className="dash-analytics-block">
    <div className="dash-analytics-title"><div><span><BarChart3 size={15}/> Live school analysis</span><h2>{data.mode === "leadership" ? "Your school in numbers" : "Operational picture"}</h2><p>Live evidence from learners, people, finance, attendance and academics.</p></div><small>Updates from SukuuNova records</small></div>
    <div className="dash-analytics-stats">
      <Stat icon={GraduationCap} label="Students" value={formatNumber(s.students)} detail={`${s.classes} active classes`} href="/school/students" />
      <Stat icon={Users} label="Teachers" value={formatNumber(s.teachers)} detail={`${s.staff} total staff accounts`} href="/school/staff" />
      <Stat icon={WalletCards} label="Students owing" value={formatNumber(s.studentsOwing)} detail={s.students ? `${Math.round((s.studentsOwing / s.students) * 100)}% of learners` : "No learners yet"} href="/school/fees/invoices" />
      <Stat icon={CircleDollarSign} label="Fees collected" value={formatMoney(s.collected)} detail={`${s.collectionRate}% of billed fees`} href="/school/fees/reports" />
      <Stat icon={ClipboardCheck} label="Attendance today" value={`${s.attendanceRate}%`} detail={`${s.attendanceToday} learners checked in`} href="/school/attendance" />
      <Stat icon={BookOpenCheck} label="Assessments" value={formatNumber(s.assessments)} detail="Exercises, tests and assessment records" href="/school/gradebook" />
    </div>
    <div className="dash-analytics-grid dash-analytics-grid-3">
      <Panel eyebrow="Learner distribution" title="Students by class" href="/school/classes"><HorizontalBars points={data.classPopulation} empty="Create classes and assign learners to see the distribution." /></Panel>
      <Panel eyebrow="Daily presence" title="7-day attendance" href="/school/attendance"><Trend points={data.attendanceTrend} total={s.students} /></Panel>
      <Panel eyebrow="Fee health" title="Collection progress" href="/school/fees/reports"><Ring percentValue={s.collectionRate} center={`${s.collectionRate}%`} label="collected" /><div className="dash-money-split"><span><small>Expected</small><b>{formatMoney(s.expected)}</b></span><span><small>Outstanding</small><b>{formatMoney(s.outstanding)}</b></span></div></Panel>
    </div>
    <div className="dash-analytics-grid dash-analytics-grid-2">
      <Panel eyebrow="People" title="Staff structure" href="/school/staff"><HorizontalBars points={data.staffRoles} empty="Staff roles will appear after accounts and roles are assigned." /></Panel>
      <Panel eyebrow="Student profiles" title="Gender distribution" href="/school/students">
        {data.gender.available ? <div className="dash-gender-grid"><div><strong>{formatNumber(data.gender.male || 0)}</strong><span>Male</span></div><div><strong>{formatNumber(data.gender.female || 0)}</strong><span>Female</span></div><div><strong>{formatNumber(data.gender.notRecorded)}</strong><span>Not recorded</span></div></div> : <div className="dash-data-gap"><VenusAndMars size={28}/><div><strong>Gender is not yet captured in student records.</strong><p>{formatNumber(data.gender.notRecorded)} active learner profiles currently have no gender field in the school data model. The dashboard will never guess this information.</p></div></div>}
      </Panel>
    </div>
  </div>;
}

function FinanceView({ data }: { data: FinancePayload }) {
  const s = data.summary;
  return <div className="dash-analytics-block">
    <div className="dash-analytics-title"><div><span><Landmark size={15}/> Finance analysis</span><h2>Collections command view</h2><p>Expected fees, cash movement, debtors and arrears in one finance briefing.</p></div><small>Live ledger data</small></div>
    <div className="dash-analytics-stats">
      <Stat icon={CircleDollarSign} label="Expected fees" value={formatMoney(s.expected)} detail={`${formatNumber(s.invoiceCount)} invoice records`} href="/school/fees/invoices" />
      <Stat icon={Banknote} label="Collected" value={formatMoney(s.collected)} detail={`${s.collectionRate}% collection rate`} href="/school/fees/payments" />
      <Stat icon={WalletCards} label="Outstanding" value={formatMoney(s.outstanding)} detail={`${s.studentsOwing} students owing`} href="/school/fees/invoices" />
      <Stat icon={CalendarDays} label="Collected today" value={formatMoney(s.paymentsToday)} detail="Payments posted since today began" href="/school/fees/payments" />
      <Stat icon={BriefcaseBusiness} label="Last 7 days" value={formatMoney(s.paymentsWeek)} detail={`${formatNumber(s.paymentCount)} payment records overall`} href="/school/fees/reports" />
      <Stat icon={Users} label="Debtors" value={formatNumber(s.studentsOwing)} detail="Learners with unpaid invoices" href="/school/fees/invoices" />
    </div>
    <div className="dash-analytics-grid dash-analytics-grid-3">
      <Panel eyebrow="Collection health" title="Collected vs outstanding" href="/school/fees/reports"><Ring percentValue={s.collectionRate} center={`${s.collectionRate}%`} label="of billed fees" /><div className="dash-money-split"><span><small>Collected</small><b>{formatMoney(s.collected)}</b></span><span><small>Balance</small><b>{formatMoney(s.outstanding)}</b></span></div></Panel>
      <Panel eyebrow="Payment channels" title="How families are paying"><HorizontalBars points={data.paymentMethods} empty="Payment methods will appear after collections are recorded." /></Panel>
      <Panel eyebrow="Arrears ageing" title="How long balances have been open" href="/school/fees/invoices"><HorizontalBars points={data.arrears} suffix="" empty="No unpaid invoices." /></Panel>
    </div>
  </div>;
}

function TeacherView({ data }: { data: TeacherPayload }) {
  const s = data.summary;
  const homework = data.assessmentTypes.find((item) => item.label === "Homework")?.value || 0;
  const quizzes = data.assessmentTypes.find((item) => item.label === "Quizzes")?.value || 0;
  const exercises = data.assessmentTypes.find((item) => item.label === "Exercises")?.value || 0;
  return <div className="dash-analytics-block">
    <div className="dash-analytics-title"><div><span><School size={15}/> Teaching analysis</span><h2>Your classroom workload</h2><p>Classes, learners, assessment workload and performance signals from your teaching scope.</p></div><small>Only your assigned teaching scope</small></div>
    <div className="dash-analytics-stats">
      <Stat icon={School} label="Classes I teach" value={formatNumber(s.classes)} detail={`${s.subjects} subjects assigned`} href="/teacher/timetable" />
      <Stat icon={GraduationCap} label="Students" value={formatNumber(s.students)} detail="Learners across assigned classes" href="/teacher/students" />
      <Stat icon={BookOpenCheck} label="Exercises" value={formatNumber(exercises)} detail={`${s.assessments} assessments in scope`} href="/teacher/gradebook" />
      <Stat icon={ClipboardCheck} label="Homework" value={formatNumber(homework)} detail="Homework assessment records" href="/teacher/homework" />
      <Stat icon={BarChart3} label="Quizzes" value={formatNumber(quizzes)} detail="Quiz assessment records" href="/teacher/gradebook" />
      <Stat icon={BriefcaseBusiness} label="Pending marking" value={formatNumber(s.pendingMarking)} detail={`${s.todayLessons} lessons scheduled today`} href="/teacher/gradebook" />
    </div>
    <div className="dash-analytics-grid dash-analytics-grid-3">
      <Panel eyebrow="Assessment mix" title="Work in your teaching scope" href="/teacher/gradebook"><HorizontalBars points={data.assessmentTypes} empty="No assessment records are connected to your assigned classes yet." /></Panel>
      <Panel eyebrow="Academic pulse" title="Average performance by class" href="/teacher/gradebook"><HorizontalBars points={data.classPerformance} suffix="%" empty="Class performance appears after marks are entered." /></Panel>
      <Panel eyebrow="Teaching week" title="Lessons by day" href="/teacher/timetable"><HorizontalBars points={data.lessonsByDay} empty="No timetable periods are assigned yet." /></Panel>
    </div>
  </div>;
}

export function DashboardAnalyticsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/home-intelligence", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load home intelligence");
        return response.json() as Promise<Payload>;
      })
      .then((payload) => { if (active) setData(payload); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const content = useMemo(() => {
    if (failed) return null;
    if (!data) return <div className="dash-analytics-loading" aria-label="Loading live statistics"><span/><span/><span/></div>;
    if (data.mode === "teacher") return <TeacherView data={data} />;
    if (data.mode === "finance") return <FinanceView data={data} />;
    return <LeadershipView data={data} />;
  }, [data, failed]);

  return content;
}
