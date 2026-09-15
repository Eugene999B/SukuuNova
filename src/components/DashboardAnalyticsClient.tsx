"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Gauge,
  GraduationCap,
  Landmark,
  School,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  VenusAndMars,
  WalletCards,
} from "lucide-react";
import "./dashboard-analytics.css";
import "./decision-intelligence.css";

type Point = { label: string; value: number };
type SchoolIdentity = { name: string; uniqueCode: string } | null;
type Confidence = "high" | "medium" | "low";
type Severity = "positive" | "info" | "warning" | "critical";
type LearnerRisk = { studentId: string; studentName: string; className: string; average: number | null; assessmentCount: number; absentCount: number; riskScore: number; severity: "low" | "medium" | "high"; reason: string };
type DecisionIntelligence = {
  headline: string;
  summary: string;
  score: number | null;
  label: string;
  components: Array<{ label: string; score: number | null; weight: number; detail: string }>;
  signals: Array<{ id: string; title: string; detail: string; severity: Severity; confidence: Confidence; metric?: string; href?: string; actionLabel?: string }>;
  recommendations: Array<{ id: string; title: string; detail: string; priority: "now" | "soon" | "monitor"; href?: string; actionLabel?: string }>;
  forecasts: Array<{ label: string; value: number; unit: "currency" | "percent" | "count"; confidence: Confidence; basis: string; caveat: string }>;
};

type LeadershipPayload = {
  mode: "leadership";
  school?: SchoolIdentity;
  summary: { students: number; staff: number; teachers: number; classes: number; assessments: number; studentsOwing: number; expected: number; collected: number; outstanding: number; collectionRate: number; attendanceToday: number; attendanceRate: number };
  classPopulation: Point[];
  attendanceTrend: Point[];
  staffRoles: Point[];
  gender: { available: boolean; male: number | null; female: number | null; otherOrUndisclosed?: number; notRecorded: number };
  academicRisk?: LearnerRisk[];
  trendComparisons?: {
    attendance: { current: number; previous: number; deltaPoints: number; recordedDays: number };
    collections: { current30: number; previous30: number; changePercent: number };
    academics: { currentTerm: string | null; average: number | null; markingCompletion: number };
  };
  intelligence: DecisionIntelligence;
};

type StaffPayload = {
  mode: "staff";
  school?: SchoolIdentity;
  visibility: { learners: boolean; people: boolean; attendance: boolean; academics: boolean };
  summary: { students: number | null; staff: number | null; teachers: number | null; classes: number | null; assessments: number | null; attendanceToday: number | null; attendanceRate: number | null };
  classPopulation: Point[];
  attendanceTrend: Point[];
  staffRoles: Point[];
  intelligence: DecisionIntelligence;
};

type FinancePayload = {
  mode: "finance";
  school?: SchoolIdentity;
  summary: { expected: number; collected: number; outstanding: number; collectionRate: number; studentsOwing: number; paymentsToday: number; paymentsWeek: number; invoiceCount: number; paymentCount: number };
  paymentMethods: Point[];
  arrears: Point[];
  collectionTrend?: { current30: number; previous30: number; changePercent: number };
  intelligence: DecisionIntelligence;
};

type TeacherPayload = {
  mode: "teacher";
  school?: SchoolIdentity;
  summary: { classes: number; subjects: number; students: number; assessments: number; pendingMarking: number; todayLessons: number; messages: number };
  assessmentTypes: Point[];
  classPerformance: Point[];
  lessonsByDay: Point[];
  riskStudents?: LearnerRisk[];
  intelligence: DecisionIntelligence;
};

type Payload = LeadershipPayload | StaffPayload | FinancePayload | TeacherPayload;
type IconType = typeof Users;

function formatNumber(value: number) { return new Intl.NumberFormat("en-GH").format(value); }
function formatMoney(value: number) { return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(value); }
function clamp(value: number) { return Math.max(0, Math.min(100, value)); }

function Stat({ icon: Icon, label, value, detail, href }: { icon: IconType; label: string; value: string; detail: string; href?: string }) {
  const content = <><span className="dash-analytics-stat-icon"><Icon size={17} aria-hidden="true" /></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></>;
  return href ? <Link className="dash-analytics-stat" href={href}>{content}</Link> : <article className="dash-analytics-stat">{content}</article>;
}

function HorizontalBars({ points, suffix = "", empty = "No data yet." }: { points: Point[]; suffix?: string; empty?: string }) {
  const max = Math.max(1, ...points.map((point) => point.value));
  if (!points.length) return <div className="dash-analytics-empty">{empty}</div>;
  return <div className="dash-bars">{points.map((point) => <div className="dash-bar-row" key={point.label}><div className="dash-bar-meta"><span>{point.label}</span><strong>{formatNumber(point.value)}{suffix}</strong></div><div className="dash-bar-track"><i style={{ width: `${Math.max(3, (point.value / max) * 100)}%` }} /></div></div>)}</div>;
}

function Ring({ percentValue, center, label }: { percentValue: number; center: string; label: string }) {
  const value = clamp(percentValue);
  return <div className="dash-ring-wrap"><div className="dash-ring" style={{ "--ring-value": `${value * 3.6}deg` } as CSSProperties}><div><strong>{center}</strong><span>{label}</span></div></div></div>;
}

function Trend({ points, total }: { points: Point[]; total?: number }) {
  const max = Math.max(1, total || 0, ...points.map((point) => point.value));
  const width = 520;
  const height = 150;
  const pad = 14;
  const coords = points.map((point, index) => ({ ...point, x: points.length <= 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2), y: height - pad - (point.value / max) * (height - pad * 2) }));
  return <div className="dash-trend"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Seven day attendance trend"><line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="dash-trend-axis" />{total ? <line x1={pad} y1={height - pad - (total / max) * (height - pad * 2)} x2={width - pad} y2={height - pad - (total / max) * (height - pad * 2)} className="dash-trend-target" /> : null}<polyline points={coords.map((point) => `${point.x},${point.y}`).join(" ")} className="dash-trend-line" />{coords.map((point) => <circle key={point.label} cx={point.x} cy={point.y} r="4" className="dash-trend-dot"><title>{`${point.label}: ${point.value}`}</title></circle>)}</svg><div className="dash-trend-labels">{points.map((point) => <span key={point.label}><b>{point.value}</b><small>{point.label}</small></span>)}</div></div>;
}

function Panel({ eyebrow, title, children, href, linkLabel = "Open" }: { eyebrow: string; title: string; children: ReactNode; href?: string; linkLabel?: string }) {
  return <section className="dash-analytics-panel"><div className="dash-analytics-panel-head"><div><span>{eyebrow}</span><h3>{title}</h3></div>{href ? <Link href={href}>{linkLabel}</Link> : null}</div>{children}</section>;
}

function SignalIcon({ severity }: { severity: Severity }) {
  if (severity === "positive") return <CheckCircle2 size={15} />;
  if (severity === "critical" || severity === "warning") return <AlertTriangle size={15} />;
  return <BrainCircuit size={15} />;
}

function formatForecast(value: number, unit: "currency" | "percent" | "count") {
  if (unit === "currency") return formatMoney(value);
  if (unit === "percent") return `${value}%`;
  return formatNumber(value);
}

function IntelligenceBrief({ intelligence }: { intelligence: DecisionIntelligence }) {
  return <section className="decision-intel" aria-label="SukuuNova decision intelligence">
    <div className="decision-intel-head"><div><span className="decision-intel-eyebrow"><Sparkles size={13}/> Explainable decision intelligence</span><h3>{intelligence.headline}</h3><p>{intelligence.summary}</p></div><div className="decision-intel-score"><div className="decision-intel-score-ring" style={{ "--score-angle": `${clamp(intelligence.score ?? 0) * 3.6}deg` } as CSSProperties}><b>{intelligence.score ?? "—"}</b></div><div><span>Intelligence score</span><strong>{intelligence.label}</strong></div></div></div>
    <div className="decision-intel-grid">
      <article className="decision-intel-card"><header><span><Gauge size={13}/> Why this score</span></header><div className="decision-intel-components">{intelligence.components.length ? intelligence.components.map((item) => <div className="decision-intel-component" key={item.label}><div><b>{item.label}</b><strong>{item.score == null ? "—" : `${item.score}%`}</strong></div><div className="decision-intel-track"><i style={{ width: `${clamp(item.score ?? 0)}%` }}/></div><small>{item.detail} Weight: {item.weight}%.</small></div>) : <div className="dash-analytics-empty">Not enough data to calculate a score yet.</div>}</div></article>
      <article className="decision-intel-card"><header><span><BrainCircuit size={13}/> What changed and why it matters</span></header><div className="decision-intel-signals">{intelligence.signals.map((signal) => <div className={`decision-intel-signal is-${signal.severity}`} key={signal.id}><span><SignalIcon severity={signal.severity}/></span><div><b>{signal.title}</b><p>{signal.detail}</p><span className="decision-intel-confidence">{signal.confidence} confidence</span></div>{signal.metric ? <strong>{signal.metric}</strong> : null}</div>)}</div></article>
    </div>
    {(intelligence.recommendations.length || intelligence.forecasts.length) ? <div className="decision-intel-grid">
      {intelligence.recommendations.length ? <article className="decision-intel-card"><header><span><Target size={13}/> Next best actions</span></header><div className="decision-intel-actions">{intelligence.recommendations.map((action) => action.href ? <Link className="decision-intel-action" href={action.href} key={action.id}><div><b>{action.title}</b><small>{action.detail}</small></div><span>{action.priority} <ArrowRight size={11}/></span></Link> : <div className="decision-intel-action" key={action.id}><div><b>{action.title}</b><small>{action.detail}</small></div><span>{action.priority}</span></div>)}</div></article> : null}
      {intelligence.forecasts.length ? <article className="decision-intel-card"><header><span><TrendingUp size={13}/> Forward view</span></header><div className="decision-intel-forecast">{intelligence.forecasts.map((forecast) => <div key={forecast.label}><div className="decision-intel-forecast-main"><span>{forecast.label}</span><strong>{formatForecast(forecast.value, forecast.unit)}</strong></div><p>{forecast.basis}</p><p><b>{forecast.confidence} confidence.</b></p><p className="decision-intel-caveat">{forecast.caveat}</p></div>)}</div></article> : null}
    </div> : null}
  </section>;
}

function RiskList({ rows }: { rows: LearnerRisk[] }) {
  if (!rows.length) return <div className="dash-analytics-empty">No learner currently crosses the dashboard risk threshold.</div>;
  return <div className="decision-risk-list">{rows.map((row) => <div className={`decision-risk-row is-${row.severity}`} key={row.studentId}><div><b>{row.studentName}</b><small>{row.className} · {row.reason}</small></div><strong>{row.riskScore}/100 risk</strong></div>)}</div>;
}

function LeadershipView({ data }: { data: LeadershipPayload }) {
  const s = data.summary;
  return <div className="dash-analytics-block">
    <div className="dash-analytics-title"><div><span><BarChart3 size={15}/> Live school analysis</span><h2>Your school in numbers</h2><p>Live evidence from learners, people, finance, attendance and academics.</p></div><small>Updates from SukuuNova records</small></div>
    <IntelligenceBrief intelligence={data.intelligence}/>
    {data.trendComparisons ? <div className="decision-comparison-grid"><div><span>Attendance · latest vs prior 30d</span><strong>{data.trendComparisons.attendance.current}%</strong><small>{data.trendComparisons.attendance.deltaPoints >= 0 ? "+" : ""}{data.trendComparisons.attendance.deltaPoints} points · {data.trendComparisons.attendance.recordedDays} recorded days</small></div><div><span>Collections · latest 30d</span><strong>{formatMoney(data.trendComparisons.collections.current30)}</strong><small>{data.trendComparisons.collections.changePercent >= 0 ? "+" : ""}{data.trendComparisons.collections.changePercent}% vs previous 30d</small></div><div><span>{data.trendComparisons.academics.currentTerm || "Academic term"}</span><strong>{data.trendComparisons.academics.average == null ? "—" : `${data.trendComparisons.academics.average}%`}</strong><small>{data.trendComparisons.academics.markingCompletion}% expected marks entered</small></div></div> : null}
    <div className="dash-analytics-stats"><Stat icon={GraduationCap} label="Students" value={formatNumber(s.students)} detail={`${s.classes} active classes`} href="/school/students"/><Stat icon={Users} label="Teachers" value={formatNumber(s.teachers)} detail={`${s.staff} total staff accounts`} href="/school/staff"/><Stat icon={WalletCards} label="Students owing" value={formatNumber(s.studentsOwing)} detail={s.students ? `${Math.round((s.studentsOwing / s.students) * 100)}% of learners` : "No learners yet"} href="/school/fees/invoices"/><Stat icon={CircleDollarSign} label="Fees collected" value={formatMoney(s.collected)} detail={`${s.collectionRate}% of billed fees`} href="/school/fees/reports"/><Stat icon={ClipboardCheck} label="Attendance today" value={`${s.attendanceRate}%`} detail={`${s.attendanceToday} learners checked in`} href="/school/attendance"/><Stat icon={BookOpenCheck} label="Assessments" value={formatNumber(s.assessments)} detail="Exercises, tests and assessment records" href="/school/gradebook"/></div>
    <div className="dash-analytics-grid dash-analytics-grid-3"><Panel eyebrow="Learner distribution" title="Students by class" href="/school/classes"><HorizontalBars points={data.classPopulation} empty="Create classes and assign learners to see the distribution."/></Panel><Panel eyebrow="Daily presence" title="7-day attendance" href="/school/attendance"><Trend points={data.attendanceTrend} total={s.students}/></Panel><Panel eyebrow="Fee health" title="Collection progress" href="/school/fees/reports"><Ring percentValue={s.collectionRate} center={`${s.collectionRate}%`} label="collected"/><div className="dash-money-split"><span><small>Expected</small><b>{formatMoney(s.expected)}</b></span><span><small>Outstanding</small><b>{formatMoney(s.outstanding)}</b></span></div></Panel></div>
    <div className="dash-analytics-grid dash-analytics-grid-2"><Panel eyebrow="Academic intervention" title="Learners needing attention" href="/school/gradebook"><RiskList rows={data.academicRisk || []}/></Panel><Panel eyebrow="People" title="Staff structure" href="/school/staff"><HorizontalBars points={data.staffRoles} empty="Staff roles will appear after accounts and roles are assigned."/></Panel></div>
    <Panel eyebrow="Student profiles" title="Gender distribution" href="/school/students">{data.gender.available ? <div className="dash-gender-grid"><div><strong>{formatNumber(data.gender.male || 0)}</strong><span>Male</span></div><div><strong>{formatNumber(data.gender.female || 0)}</strong><span>Female</span></div><div><strong>{formatNumber(data.gender.otherOrUndisclosed || 0)}</strong><span>Other / undisclosed</span></div><div><strong>{formatNumber(data.gender.notRecorded)}</strong><span>Not recorded</span></div></div> : <div className="dash-data-gap"><VenusAndMars size={28}/><div><strong>Gender details are not available.</strong><p>{formatNumber(data.gender.notRecorded)} active learner profiles need their recorded demographic details reviewed.</p></div></div>}</Panel>
  </div>;
}

function StaffView({ data }: { data: StaffPayload }) {
  const s = data.summary;
  const cards: ReactNode[] = [];
  if (data.visibility.learners && s.students !== null) cards.push(<Stat key="students" icon={GraduationCap} label="Students" value={formatNumber(s.students)} detail={`${s.classes ?? 0} classes in the school`} href="/school/students"/>);
  if (data.visibility.people && s.staff !== null) cards.push(<Stat key="staff" icon={Users} label="Staff" value={formatNumber(s.staff)} detail={`${s.teachers ?? 0} teacher accounts`} href="/school/staff"/>);
  if (data.visibility.attendance && s.attendanceRate !== null) cards.push(<Stat key="attendance" icon={ClipboardCheck} label="Attendance today" value={`${s.attendanceRate}%`} detail={`${s.attendanceToday ?? 0} learners checked in`} href="/school/attendance"/>);
  if (data.visibility.academics && s.assessments !== null) cards.push(<Stat key="assessments" icon={BookOpenCheck} label="Assessments" value={formatNumber(s.assessments)} detail="Assessment records currently available" href="/school/gradebook"/>);
  return <div className="dash-analytics-block"><div className="dash-analytics-title"><div><span><BarChart3 size={15}/> Role intelligence</span><h2>Your operational picture</h2><p>Only statistics allowed by your assigned role and permissions are analysed.</p></div><small>Permission-aware live data</small></div><IntelligenceBrief intelligence={data.intelligence}/>{cards.length ? <div className="dash-analytics-stats">{cards}</div> : <div className="dash-analytics-empty">No additional analytics are assigned to this role.</div>}{(data.visibility.learners || data.visibility.attendance || data.visibility.people) ? <div className="dash-analytics-grid dash-analytics-grid-3">{data.visibility.learners ? <Panel eyebrow="Learners" title="Students by class" href="/school/classes"><HorizontalBars points={data.classPopulation}/></Panel> : null}{data.visibility.attendance ? <Panel eyebrow="Daily presence" title="7-day attendance" href="/school/attendance"><Trend points={data.attendanceTrend} total={s.students ?? undefined}/></Panel> : null}{data.visibility.people ? <Panel eyebrow="People" title="Staff structure" href="/school/staff"><HorizontalBars points={data.staffRoles}/></Panel> : null}</div> : null}</div>;
}

function FinanceView({ data }: { data: FinancePayload }) {
  const s = data.summary;
  return <div className="dash-analytics-block"><div className="dash-analytics-title"><div><span><Landmark size={15}/> Finance analysis</span><h2>Collections command view</h2><p>Expected fees, cash movement, debtors, velocity and arrears in one finance briefing.</p></div><small>Live ledger data</small></div><IntelligenceBrief intelligence={data.intelligence}/>{data.collectionTrend ? <div className="decision-comparison-grid"><div><span>Latest 30 days</span><strong>{formatMoney(data.collectionTrend.current30)}</strong><small>Recorded collections</small></div><div><span>Previous 30 days</span><strong>{formatMoney(data.collectionTrend.previous30)}</strong><small>Comparison baseline</small></div><div><span>Momentum</span><strong>{data.collectionTrend.changePercent >= 0 ? "+" : ""}{data.collectionTrend.changePercent}%</strong><small>Latest vs previous window</small></div></div> : null}<div className="dash-analytics-stats"><Stat icon={CircleDollarSign} label="Expected fees" value={formatMoney(s.expected)} detail={`${formatNumber(s.invoiceCount)} invoice records`} href="/school/fees/invoices"/><Stat icon={Banknote} label="Collected" value={formatMoney(s.collected)} detail={`${s.collectionRate}% collection rate`} href="/school/fees/payments"/><Stat icon={WalletCards} label="Outstanding" value={formatMoney(s.outstanding)} detail={`${s.studentsOwing} students owing`} href="/school/fees/invoices"/><Stat icon={CalendarDays} label="Collected today" value={formatMoney(s.paymentsToday)} detail="Payments posted since today began" href="/school/fees/payments"/><Stat icon={BriefcaseBusiness} label="Last 7 days" value={formatMoney(s.paymentsWeek)} detail={`${formatNumber(s.paymentCount)} payment records overall`} href="/school/fees/reports"/><Stat icon={Users} label="Debtors" value={formatNumber(s.studentsOwing)} detail="Learners with unpaid invoices" href="/school/fees/invoices"/></div><div className="dash-analytics-grid dash-analytics-grid-3"><Panel eyebrow="Collection health" title="Collected vs outstanding" href="/school/fees/reports"><Ring percentValue={s.collectionRate} center={`${s.collectionRate}%`} label="of billed fees"/><div className="dash-money-split"><span><small>Collected</small><b>{formatMoney(s.collected)}</b></span><span><small>Balance</small><b>{formatMoney(s.outstanding)}</b></span></div></Panel><Panel eyebrow="Payment channels" title="How families are paying"><HorizontalBars points={data.paymentMethods}/></Panel><Panel eyebrow="Arrears ageing" title="How long balances have been open" href="/school/fees/invoices"><HorizontalBars points={data.arrears}/></Panel></div></div>;
}

function TeacherView({ data }: { data: TeacherPayload }) {
  const s = data.summary;
  const homework = data.assessmentTypes.find((item) => item.label === "Homework")?.value || 0;
  const quizzes = data.assessmentTypes.find((item) => item.label === "Quizzes")?.value || 0;
  const exercises = data.assessmentTypes.find((item) => item.label === "Exercises")?.value || 0;
  return <div className="dash-analytics-block"><div className="dash-analytics-title"><div><span><School size={15}/> Teaching analysis</span><h2>Your classroom workload</h2><p>Classes, learners, marking, performance and intervention priorities from your own teaching scope.</p></div><small>Only your assigned teaching scope</small></div><IntelligenceBrief intelligence={data.intelligence}/><div className="dash-analytics-stats"><Stat icon={School} label="Classes I teach" value={formatNumber(s.classes)} detail={`${s.subjects} subjects assigned`} href="/teacher/timetable"/><Stat icon={GraduationCap} label="Students" value={formatNumber(s.students)} detail="Learners across assigned classes" href="/teacher/students"/><Stat icon={BookOpenCheck} label="Exercises" value={formatNumber(exercises)} detail={`${s.assessments} assessments in scope`} href="/teacher/gradebook"/><Stat icon={ClipboardCheck} label="Homework" value={formatNumber(homework)} detail="Homework assessment records" href="/teacher/homework"/><Stat icon={BarChart3} label="Quizzes" value={formatNumber(quizzes)} detail="Quiz assessment records" href="/teacher/gradebook"/><Stat icon={BriefcaseBusiness} label="Pending marking" value={formatNumber(s.pendingMarking)} detail={`${s.todayLessons} lessons scheduled today`} href="/teacher/gradebook"/></div><div className="dash-analytics-grid dash-analytics-grid-3"><Panel eyebrow="Assessment mix" title="Work in your teaching scope" href="/teacher/gradebook"><HorizontalBars points={data.assessmentTypes}/></Panel><Panel eyebrow="Academic pulse" title="Average performance by class" href="/teacher/gradebook"><HorizontalBars points={data.classPerformance} suffix="%"/></Panel><Panel eyebrow="Teaching week" title="Lessons by day" href="/teacher/timetable"><HorizontalBars points={data.lessonsByDay}/></Panel></div><Panel eyebrow="Intervention queue" title="Learners most in need of attention" href="/teacher/gradebook"><RiskList rows={data.riskStudents || []}/></Panel></div>;
}

export function DashboardAnalyticsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/home-intelligence", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Unable to load home intelligence");
      return response.json() as Promise<Payload>;
    }).then((payload) => { if (active) setData(payload); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return useMemo(() => {
    if (failed) return null;
    if (!data) return <div className="dash-analytics-loading" aria-label="Loading live statistics"><span/><span/><span/></div>;
    if (data.mode === "teacher") return <TeacherView data={data}/>;
    if (data.mode === "finance") return <FinanceView data={data}/>;
    if (data.mode === "staff") return <StaffView data={data}/>;
    return <LeadershipView data={data}/>;
  }, [data, failed]);
}
