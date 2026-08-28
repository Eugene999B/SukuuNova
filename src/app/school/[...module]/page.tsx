import { redirect } from "next/navigation";
import Link from "next/link";
import { getSchoolSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

type Definition = { title: string; description: string; action: string; actionHref: string };

const definitions: Record<string, Definition> = {
  "search": { title: "Search", description: "Search across the people and records in your school workspace.", action: "Search the school", actionHref: "/school/search" },
  "students": { title: "Students", description: "Build and manage your student register, profiles, class placement and family links.", action: "Add a student", actionHref: "/school/students" },
  "guardians": { title: "Parents & Guardians", description: "Maintain family contacts and connect guardians to their learners.", action: "Add a guardian", actionHref: "/school/guardians" },
  "staff": { title: "Staff & Teachers", description: "Manage teachers, administrators, support staff and their access to SukuuNova.", action: "Open staff workspace", actionHref: "/school/staff" },
  "admissions/enquiries": { title: "Admissions Enquiries", description: "Capture prospective learner enquiries before an application is started.", action: "Create enquiry", actionHref: "/school/admissions/enquiries" },
  "admissions/applications": { title: "Applications", description: "Review and track learner applications through your admissions workflow.", action: "Create application", actionHref: "/school/admissions/applications" },
  "admissions/enrolment": { title: "Enrolment", description: "Turn approved applications into active student records and class placements.", action: "Open enrolment", actionHref: "/school/admissions/enrolment" },
  "classes": { title: "Classes & Houses", description: "Create class groups, streams, houses and the structure used by your school.", action: "Create a class", actionHref: "/school/classes" },
  "subjects": { title: "Subjects", description: "Define the subjects taught in your school and connect them to classes and teachers.", action: "Add a subject", actionHref: "/school/subjects" },
  "timetable": { title: "Timetable", description: "Plan lessons, teaching periods, rooms and staff schedules.", action: "Open timetable", actionHref: "/school/timetable" },
  "lessons": { title: "Lessons & Planning", description: "Organise lesson planning, teaching resources and classroom work.", action: "Start planning", actionHref: "/school/lessons" },
  "homework": { title: "Homework & Exercises", description: "Create exercises, assignments and learner practice work.", action: "Create exercise", actionHref: "/school/homework" },
  "gradebook": { title: "Gradebook", description: "Record learner marks and monitor academic performance by class and subject.", action: "Open gradebook", actionHref: "/school/gradebook" },
  "exams": { title: "Exams & Assessments", description: "Plan examinations, continuous assessment and result publication.", action: "Create assessment", actionHref: "/school/exams" },
  "report-cards": { title: "Report Cards", description: "Prepare, review and publish learner academic reports.", action: "Open report cards", actionHref: "/school/report-cards" },
  "attendance": { title: "Student Attendance", description: "Take daily registers and review attendance history by learner or class.", action: "Mark attendance", actionHref: "/school/attendance" },
  "staff-attendance": { title: "Staff Attendance", description: "Track staff presence, lateness and attendance history.", action: "Open staff attendance", actionHref: "/school/staff-attendance" },
  "attendance/exceptions": { title: "Late / Absence", description: "Review attendance exceptions and follow up on unexplained absences.", action: "Review exceptions", actionHref: "/school/attendance/exceptions" },
  "communications/alerts": { title: "Parent Alerts", description: "Review the alerts and notifications that will keep families informed.", action: "Open alerts", actionHref: "/school/communications/alerts" },
  "fees": { title: "School Fees", description: "Configure fees and the charges your school expects learners to pay.", action: "Configure fees", actionHref: "/school/fees" },
  "fees/invoices": { title: "Invoices", description: "Create and manage school fee invoices.", action: "Open invoices", actionHref: "/school/fees/invoices" },
  "fees/payments": { title: "Payments", description: "Record and review school fee payments and receipts.", action: "Record payment", actionHref: "/school/fees/payments" },
  "fees/arrears": { title: "Arrears & Balances", description: "Monitor outstanding balances and follow up on overdue fees.", action: "Review balances", actionHref: "/school/fees/arrears" },
  "fees/reports": { title: "Finance Reports", description: "Review financial summaries for fees, collections and outstanding balances.", action: "Open reports", actionHref: "/school/fees/reports" },
  "library": { title: "Library", description: "Manage books, lending activity and learner library records.", action: "Open library", actionHref: "/school/library" },
  "transport": { title: "Transport", description: "Manage school routes, vehicles, pickup points and transport assignments.", action: "Open transport", actionHref: "/school/transport" },
  "feeding": { title: "Feeding", description: "Plan and manage school feeding and meal operations.", action: "Open feeding", actionHref: "/school/feeding" },
  "inventory": { title: "Assets & Inventory", description: "Track school equipment, supplies and assets.", action: "Add an asset", actionHref: "/school/inventory" },
  "hr/recruitment": { title: "Recruitment", description: "Track recruitment activity and prospective staff from enquiry through hiring.", action: "Open recruitment", actionHref: "/school/hr/recruitment" },
  "communications/messages": { title: "Messages", description: "Centralise school conversations and important communications.", action: "Compose message", actionHref: "/school/communications/messages" },
  "communications/announcements": { title: "Announcements", description: "Publish school-wide notices to staff, students and families.", action: "Create announcement", actionHref: "/school/communications/announcements" },
  "communications/broadcasts": { title: "SMS / WhatsApp", description: "Prepare parent and staff broadcasts through your configured messaging channels.", action: "Create broadcast", actionHref: "/school/communications/broadcasts" },
  "events": { title: "Events", description: "Plan school events, meetings, activities and important dates.", action: "Create event", actionHref: "/school/events" },
  "reports/analytics": { title: "School Analytics", description: "Bring attendance, academic, enrolment and financial signals together for decision-making.", action: "Open analytics", actionHref: "/school/reports/analytics" },
  "reports": { title: "Reports", description: "Access school reports and operational summaries.", action: "Open reports", actionHref: "/school/reports" },
  "settings/roles": { title: "Roles & Permissions", description: "Control who can see and act on each part of the school workspace.", action: "Manage roles", actionHref: "/school/settings/roles" },
  "settings": { title: "School Settings", description: "Configure your school profile, operational preferences, term structure and integrations.", action: "Open settings", actionHref: "/school/settings" },
  "help": { title: "Help & Support", description: "Get help understanding SukuuNova and the workflows available to your school.", action: "Open support", actionHref: "/school/help" }
};

function resolveDefinition(parts: string[]) {
  const key = parts.join("/");
  return definitions[key] ?? { title: parts.at(-1)?.replace(/[-_]/g, " ") ?? "School workspace", description: "This school workspace is being prepared for your organisation.", action: "Return to overview", actionHref: "/dashboard" };
}

export default async function SchoolModulePage({ params }: { params: Promise<{ module: string[] }> }) {
  const session = await getSchoolSession();
  if (!session) redirect("/login/school");
  const { module } = await params;
  const definition = resolveDefinition(module);

  const account = await withTenant(session.schoolId, (tx) => tx.user.findUnique({
    where: { id: session.userId },
    select: {
      name: true,
      school: { select: { name: true, uniqueCode: true } },
      userRoles: { include: { role: { select: { name: true } } } }
    }
  }));
  if (!account) redirect("/login/school");

  const role = account.userRoles.map((r) => r.role.name).join(", ") || "Administrator";
  return (
    <AppShell universe="school" title={definition.title} subtitle={`${account.school.name} · ${account.school.uniqueCode} · ${role}`} active={definition.title} schoolName={account.school.name} schoolCode={account.school.uniqueCode} userName={account.name} role={role}>
      <section className="app-card app-module-hero">
        <div className="app-empty-orb">S</div>
        <p className="app-eyebrow">School workspace</p>
        <h2>{definition.title}</h2>
        <p>{definition.description}</p>
        <div className="app-module-actions"><Link className="app-primary-action" href={definition.actionHref}>{definition.action} →</Link><Link className="app-secondary-action" href="/dashboard">Back to overview</Link></div>
      </section>
      <section className="app-card app-panel app-honest-empty">
        <div className="app-card-head"><div><h2>Nothing entered yet</h2><p>This screen will populate from your school&apos;s real records as you use SukuuNova.</p></div><span className="app-pill">0 records</span></div>
        <div className="app-empty-copy"><strong>No sample data.</strong><span>We will never display invented students, payments, attendance or school activity.</span></div>
      </section>
    </AppShell>
  );
}
