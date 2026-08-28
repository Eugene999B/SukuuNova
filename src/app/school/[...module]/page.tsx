import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSchoolSession } from "@/lib/school-auth";

type ModuleConfig = {
  title: string;
  group: string;
  description: string;
  action: string;
  tabs: string[];
  columns: string[];
  workflow: string[];
  capabilities: string[];
};

const modules: Record<string, ModuleConfig> = {
  students: {
    title: "Students",
    group: "People",
    description: "Manage learner profiles, admission numbers, class placement, guardians, attendance, academics and fee accounts.",
    action: "Add student",
    tabs: ["All students", "Active", "Pending", "Graduated", "Archived"],
    columns: ["Student", "Admission no.", "Class", "Guardians", "Attendance", "Fees", "Status"],
    workflow: ["Capture learner details", "Link guardians and documents", "Assign class", "Track attendance, academics and fees", "Transfer, graduate or archive"],
    capabilities: ["Student profiles", "Admission numbers", "Class placement", "Guardian links", "Documents", "Attendance history", "Academic history", "Fee account", "Transfers"]
  },
  guardians: {
    title: "Parents & Guardians",
    group: "People",
    description: "Manage family contacts, learner relationships, communication access and pickup permissions.",
    action: "Add guardian",
    tabs: ["All guardians", "Primary contacts", "Portal access", "Needs attention"],
    columns: ["Guardian", "Phone", "Learners", "Primary", "Portal", "Status"],
    workflow: ["Create family contact", "Link learners", "Set primary relationship", "Enable communication access", "Review family history"],
    capabilities: ["Family profiles", "Relationships", "Primary contacts", "Portal access", "Communication history", "Pickup permissions"]
  },
  staff: {
    title: "Staff & Teachers",
    group: "People",
    description: "Manage staff records, roles, teaching assignments, attendance and payroll readiness.",
    action: "Add staff",
    tabs: ["All staff", "Teachers", "Administrators", "Inactive"],
    columns: ["Staff member", "Role", "Teaching load", "Attendance", "Payroll", "Status"],
    workflow: ["Create staff account", "Assign role", "Assign classes and subjects", "Track attendance", "Prepare payroll"],
    capabilities: ["Staff directory", "Roles", "Permissions", "Teaching assignments", "Attendance", "Salary structures", "Payroll", "Payslips"]
  },
  "admissions/enquiries": {
    title: "Admissions Enquiries",
    group: "Admissions",
    description: "Capture prospective-family enquiries and move qualified prospects into applications.",
    action: "Add enquiry",
    tabs: ["New", "Contacted", "Qualified", "Converted", "Closed"],
    columns: ["Prospect", "Interested class", "Contact", "Source", "Owner", "Status"],
    workflow: ["Capture enquiry", "Contact family", "Qualify interest", "Convert to application", "Follow up or close"],
    capabilities: ["Lead register", "Follow-up", "Sources", "Conversion tracking"]
  },
  "admissions/applications": {
    title: "Applications",
    group: "Admissions",
    description: "Review learner applications, documents and admission decisions.",
    action: "New application",
    tabs: ["Draft", "Submitted", "Review", "Accepted", "Rejected"],
    columns: ["Applicant", "Class", "Submitted", "Reviewer", "Decision"],
    workflow: ["Receive application", "Validate details", "Review documents", "Accept or reject", "Prepare enrolment"],
    capabilities: ["Applications", "Document review", "Decisions", "Admission workflow"]
  },
  "admissions/enrolment": {
    title: "Enrolment",
    group: "Admissions",
    description: "Turn approved applications into official student records and class placements.",
    action: "Start enrolment",
    tabs: ["Ready", "In progress", "Completed", "Withdrawn"],
    columns: ["Applicant", "Class", "Admission no.", "Start date", "Status"],
    workflow: ["Approve applicant", "Create student", "Assign admission number", "Place class", "Activate learner"],
    capabilities: ["Student creation", "Admission numbers", "Class placement", "Activation"]
  },
  classes: {
    title: "Classes & Houses",
    group: "Admissions",
    description: "Organize the school's academic structure, class teachers, houses and learner capacity.",
    action: "Create class",
    tabs: ["Classes", "Houses", "Class teachers", "Capacity"],
    columns: ["Class", "Level", "Students", "Class teacher", "Subjects", "Status"],
    workflow: ["Define structure", "Assign class teacher", "Connect subjects", "Place learners", "Monitor capacity"],
    capabilities: ["Classes", "Levels", "Houses", "Class teachers", "Subject assignments", "Capacity"]
  },
  subjects: {
    title: "Subjects",
    group: "Academics",
    description: "Manage subjects and connect them to classes, teachers, assessments and timetables.",
    action: "Add subject",
    tabs: ["All subjects", "Core", "Electives", "Unassigned"],
    columns: ["Subject", "Classes", "Teachers", "Assessments", "Timetable slots"],
    workflow: ["Create subject", "Assign classes", "Assign teachers", "Schedule periods", "Assess performance"],
    capabilities: ["Subject catalogue", "Class assignment", "Teacher assignment", "Curriculum mapping", "Assessment linkage"]
  },
  timetable: {
    title: "Timetable",
    group: "Academics",
    description: "Build weekly schedules, detect clashes and manage authorized substitute coverage.",
    action: "Add timetable slot",
    tabs: ["Weekly timetable", "Teacher view", "Class view", "Substitutes"],
    columns: ["Day", "Period", "Class", "Subject", "Teacher", "Substitute"],
    workflow: ["Define periods", "Schedule class and subject", "Assign teacher", "Check clashes", "Assign substitute"],
    capabilities: ["Weekly timetable", "Teacher view", "Class view", "Conflict detection", "Substitutes"]
  },
  lessons: {
    title: "Lessons & Planning",
    group: "Academics",
    description: "Plan lessons, schemes and classroom activities around the school's curriculum.",
    action: "Create lesson",
    tabs: ["Planned", "This week", "Completed", "Templates"],
    columns: ["Lesson", "Class", "Subject", "Teacher", "Date", "Status"],
    workflow: ["Choose class and subject", "Plan objectives", "Add resources", "Deliver lesson", "Record completion"],
    capabilities: ["Lesson plans", "Objectives", "Resources", "Teacher planning", "Completion tracking"]
  },
  homework: {
    title: "Homework & Exercises",
    group: "Academics",
    description: "Create exercises, assign work, collect submissions and review learner completion.",
    action: "Create exercise",
    tabs: ["Draft", "Assigned", "Due", "Submitted", "Reviewed"],
    columns: ["Exercise", "Class", "Subject", "Due", "Submitted", "Status"],
    workflow: ["Create exercise", "Assign audience", "Set due date", "Collect work", "Review and grade"],
    capabilities: ["Assignments", "Exercises", "Due dates", "Submission tracking", "Grading"]
  },
  gradebook: {
    title: "Gradebook",
    group: "Academics",
    description: "Review marks by learner, class, subject and assessment and identify missing scores.",
    action: "Open gradebook",
    tabs: ["By class", "By subject", "Missing scores", "Published"],
    columns: ["Learner", "Class", "Subject", "Assessment", "Score", "Grade", "Entered by"],
    workflow: ["Select term", "Review assessments", "Enter or correct scores", "Check completion", "Publish results"],
    capabilities: ["Score entry", "Bulk entry", "Missing scores", "Grade calculation", "Performance analysis"]
  },
  exams: {
    title: "Exams & Assessments",
    group: "Academics",
    description: "Plan tests and examinations, define weights, collect scores and lock approved results.",
    action: "Create assessment",
    tabs: ["Planned", "Open", "Submitted", "Locked", "Results"],
    columns: ["Assessment", "Term", "Class", "Subject", "Weight", "Scores", "Status"],
    workflow: ["Create assessment", "Set class and subject", "Collect scores", "Moderate results", "Lock results"],
    capabilities: ["Assessment setup", "Weights", "Score entry", "Moderation", "Result locking"]
  },
  "report-cards": {
    title: "Report Cards",
    group: "Academics",
    description: "Generate, review, approve, brand and publish learner report cards.",
    action: "Generate report cards",
    tabs: ["Draft", "For review", "Approved", "Sent"],
    columns: ["Learner", "Class", "Term", "Template", "Status", "Approved", "Sent"],
    workflow: ["Collect verified results", "Generate reports", "Review", "Approve", "Publish to families"],
    capabilities: ["Report generation", "Templates", "Branding", "Approval workflow", "PDF output"]
  },
  attendance: {
    title: "Student Attendance",
    group: "Attendance",
    description: "Take daily registers, manage lateness and absences, investigate exceptions and alert families.",
    action: "Take attendance",
    tabs: ["Today", "History", "Absences", "Late", "Exceptions"],
    columns: ["Date", "Class", "Present", "Late", "Absent", "Method", "Recorded by"],
    workflow: ["Select class and date", "Mark attendance", "Record reason", "Review exceptions", "Notify families"],
    capabilities: ["Daily register", "Attendance history", "Late tracking", "Absence reasons", "Parent alerts", "Reports"]
  },
  "staff-attendance": {
    title: "Staff Attendance",
    group: "Attendance",
    description: "Track staff attendance, late arrivals and workforce attendance trends.",
    action: "Record staff attendance",
    tabs: ["Today", "History", "Late", "Absent"],
    columns: ["Date", "Staff member", "Status", "Method", "Recorded by"],
    workflow: ["Open staff register", "Record status", "Review late cases", "Track trends", "Link to HR/payroll"],
    capabilities: ["Daily register", "Late tracking", "Trends", "Payroll linkage", "HR reporting"]
  },
  fees: {
    title: "School Fees",
    group: "Finance",
    description: "Configure fee structures, bill learners, monitor collections and manage outstanding balances.",
    action: "Create fee item",
    tabs: ["Overview", "Fee items", "Billed", "Collected", "Arrears"],
    columns: ["Fee item", "Term", "Class", "Amount", "Billed", "Collected", "Balance"],
    workflow: ["Define fee", "Assign term/class", "Generate invoices", "Collect payments", "Follow up balances"],
    capabilities: ["Fee structures", "Term billing", "Invoices", "Receipts", "Payments", "Arrears", "Reports"]
  },
  "fees/invoices": {
    title: "Invoices",
    group: "Finance",
    description: "Manage student invoices, line items, balances and payment status.",
    action: "Create invoice",
    tabs: ["All", "Unpaid", "Part-paid", "Paid", "Overdue"],
    columns: ["Invoice", "Student", "Term", "Total", "Paid", "Balance", "Status"],
    workflow: ["Generate invoice", "Review lines", "Receive payment", "Track balance", "Escalate overdue"],
    capabilities: ["Invoice generation", "Line items", "Partial payments", "Balances", "Receipts"]
  },
  "fees/payments": {
    title: "Payments",
    group: "Finance",
    description: "Record fee payments, references, payment methods and authorized reversals.",
    action: "Record payment",
    tabs: ["Today", "Recent", "Unreconciled", "Reversed"],
    columns: ["Date", "Student", "Invoice", "Amount", "Method", "Reference", "Status"],
    workflow: ["Select invoice", "Capture payment", "Issue receipt", "Reconcile", "Reverse when authorized"],
    capabilities: ["Cash", "Bank", "Mobile money", "References", "Receipts", "Reconciliation", "Reversals"]
  },
  "fees/arrears": {
    title: "Arrears & Balances",
    group: "Finance",
    description: "Identify outstanding accounts, prioritize follow-up and track cleared balances.",
    action: "Review arrears",
    tabs: ["All owing", "Due soon", "Overdue", "High balance", "Cleared"],
    columns: ["Student", "Class", "Invoice total", "Paid", "Balance", "Days overdue", "Action"],
    workflow: ["Calculate balance", "Segment accounts", "Send reminder", "Record arrangement", "Close cleared balance"],
    capabilities: ["Balance aging", "Overdue queue", "Reminders", "Payment plans", "Collections reporting"]
  },
  "communications/messages": {
    title: "Messages",
    group: "Communication",
    description: "Manage school-to-family messages and inspect delivery status and history.",
    action: "Compose message",
    tabs: ["Inbox", "Sent", "Queued", "Failed"],
    columns: ["Recipient", "Channel", "Subject", "Sent", "Status"],
    workflow: ["Choose audience", "Compose", "Review recipients", "Send", "Monitor delivery"],
    capabilities: ["Targeted messages", "Templates", "SMS", "WhatsApp", "Delivery tracking"]
  },
  "communications/announcements": {
    title: "Announcements",
    group: "Communication",
    description: "Publish school announcements to targeted groups on a schedule.",
    action: "Create announcement",
    tabs: ["Draft", "Scheduled", "Published", "Expired"],
    columns: ["Title", "Audience", "Published", "Channel", "Status"],
    workflow: ["Write announcement", "Select audience", "Schedule or publish", "Track reach", "Archive"],
    capabilities: ["Audience targeting", "Scheduling", "Channels", "Publication history"]
  },
  "communications/broadcasts": {
    title: "SMS / WhatsApp",
    group: "Communication",
    description: "Run targeted broadcasts and manage approved communication templates and delivery.",
    action: "Create broadcast",
    tabs: ["Compose", "Queued", "Sent", "Failed", "Templates"],
    columns: ["Audience", "Channel", "Template", "Recipients", "Delivered", "Failed"],
    workflow: ["Choose audience", "Select template", "Preview", "Send", "Review delivery"],
    capabilities: ["SMS", "WhatsApp", "Templates", "Recipient groups", "Delivery logs"]
  },
  events: {
    title: "Events",
    group: "Communication",
    description: "Manage the school calendar, meetings, activities and operational dates.",
    action: "Create event",
    tabs: ["Upcoming", "Calendar", "Past", "Operational"],
    columns: ["Event", "Type", "Start", "End", "Attendance", "Status"],
    workflow: ["Create event", "Set date and audience", "Add operational impact", "Communicate", "Review completion"],
    capabilities: ["Calendar", "Academic events", "Meetings", "Operational effects"]
  },
  library: {
    title: "Library",
    group: "School Life",
    description: "Manage the library catalogue, lending, returns and overdue resources.",
    action: "Add book",
    tabs: ["Catalogue", "Borrowed", "Overdue", "Returns"],
    columns: ["Book", "Category", "Available", "Borrowed", "Due", "Status"],
    workflow: ["Catalogue resource", "Issue to learner", "Track due date", "Receive return", "Follow up overdue"],
    capabilities: ["Catalogue", "Circulation", "Borrower history", "Due dates", "Overdue tracking"]
  },
  transport: {
    title: "Transport",
    group: "School Life",
    description: "Organize routes, vehicles, drivers, stops and learner transport assignments.",
    action: "Create route",
    tabs: ["Routes", "Vehicles", "Stops", "Assignments"],
    columns: ["Route", "Vehicle", "Driver", "Stops", "Students", "Status"],
    workflow: ["Create route", "Add vehicle and driver", "Define stops", "Assign learners", "Monitor changes"],
    capabilities: ["Routes", "Vehicles", "Drivers", "Stops", "Assignments"]
  },
  feeding: {
    title: "Feeding",
    group: "School Life",
    description: "Plan meals, menus and feeding records for school service.",
    action: "Create meal plan",
    tabs: ["Today", "Menu", "Attendance", "History"],
    columns: ["Date", "Meal", "Menu", "Expected", "Served", "Status"],
    workflow: ["Plan menu", "Set expected numbers", "Record service", "Review feeding", "Track history"],
    capabilities: ["Meal plans", "Menus", "Feeding register", "Service records"]
  },
  inventory: {
    title: "Assets & Inventory",
    group: "School Life",
    description: "Track assets, stock, locations, assignments, maintenance and lifecycle status.",
    action: "Add asset",
    tabs: ["Assets", "Stock", "Assigned", "Maintenance", "Retired"],
    columns: ["Item", "Category", "Location", "Qty", "Assigned to", "Condition"],
    workflow: ["Register asset", "Assign location", "Record movement", "Track maintenance", "Retire asset"],
    capabilities: ["Asset register", "Stock control", "Locations", "Maintenance", "Lifecycle"]
  },
  "hr/recruitment": {
    title: "Recruitment",
    group: "School Life",
    description: "Track vacancies, candidates, interview stages and hiring decisions.",
    action: "Create vacancy",
    tabs: ["Open", "Applications", "Shortlist", "Interview", "Hired"],
    columns: ["Candidate", "Role", "Applied", "Stage", "Owner", "Status"],
    workflow: ["Create vacancy", "Receive applications", "Shortlist", "Interview", "Hire and onboard"],
    capabilities: ["Vacancies", "Candidate records", "Shortlisting", "Interviews", "Onboarding"]
  },
  "reports/analytics": {
    title: "School Analytics",
    group: "Reports & Admin",
    description: "Monitor school-wide indicators across enrolment, attendance, academics, finance and operations.",
    action: "Build report",
    tabs: ["Overview", "Students", "Attendance", "Academics", "Finance"],
    columns: ["Metric", "Period", "Current", "Previous", "Trend"],
    workflow: ["Choose period", "Choose metric", "Filter audience", "Analyze trend", "Export or share"],
    capabilities: ["KPI dashboards", "Trend analysis", "Cohorts", "Comparisons", "Exports"]
  },
  reports: {
    title: "Reports",
    group: "Reports & Admin",
    description: "Generate operational reports for school leadership and authorized users.",
    action: "Create report",
    tabs: ["Saved", "Scheduled", "Recent", "Exports"],
    columns: ["Report", "Category", "Owner", "Last run", "Format", "Status"],
    workflow: ["Choose report type", "Set filters", "Run report", "Review", "Export or schedule"],
    capabilities: ["Student reports", "Academic reports", "Attendance reports", "Finance reports", "Scheduled exports"]
  },
  "settings/roles": {
    title: "Roles & Permissions",
    group: "Reports & Admin",
    description: "Control access by role, module and permission while keeping sensitive school data protected.",
    action: "Create role",
    tabs: ["Roles", "Permissions", "Users", "Overrides"],
    columns: ["Role", "Users", "Modules", "Sensitive access", "Status"],
    workflow: ["Create role", "Select modules", "Grant permissions", "Assign users", "Review access"],
    capabilities: ["Role management", "Module permissions", "Overrides", "Access review", "Security audit"]
  },
  settings: {
    title: "School Settings",
    group: "Reports & Admin",
    description: "Configure the school's identity, academic calendar, defaults, communication and operational policies.",
    action: "Edit settings",
    tabs: ["General", "Academic year", "Branding", "Communication", "Security"],
    columns: ["Setting", "Category", "Current value", "Last changed", "Changed by"],
    workflow: ["Choose setting group", "Edit values", "Validate", "Save", "Audit change"],
    capabilities: ["School profile", "Academic calendar", "Branding", "Communication", "Security"]
  },
  "attendance/exceptions": {
    title: "Late / Absence",
    group: "Attendance",
    description: "Review attendance exceptions, investigate reasons and resolve follow-up actions.",
    action: "Review exceptions",
    tabs: ["Open", "Late", "Absent", "Excused", "Resolved"],
    columns: ["Learner", "Class", "Date", "Type", "Reason", "Action", "Status"],
    workflow: ["Identify exception", "Review reason", "Contact family", "Record resolution", "Close case"],
    capabilities: ["Exception queue", "Reasons", "Follow-up", "Family contact", "Resolution history"]
  },
  "communications/alerts": {
    title: "Parent Alerts",
    group: "Attendance",
    description: "Manage attendance and operational notifications sent to parents and guardians.",
    action: "Create alert",
    tabs: ["Ready", "Queued", "Sent", "Failed", "Templates"],
    columns: ["Alert", "Audience", "Channel", "Created", "Delivered", "Status"],
    workflow: ["Choose trigger or audience", "Review message", "Send", "Track delivery", "Resolve failures"],
    capabilities: ["Absence alerts", "Late alerts", "Fee reminders", "Templates", "Delivery tracking"]
  },
  "fees/reports": {
    title: "Finance Reports",
    group: "Finance",
    description: "Analyze billing, collections, arrears, payment methods and outstanding balances.",
    action: "Run finance report",
    tabs: ["Collections", "Arrears", "Invoices", "Payments", "Reconciliation"],
    columns: ["Report", "Period", "Billed", "Collected", "Balance", "Status"],
    workflow: ["Choose period", "Select report", "Filter", "Run", "Export"],
    capabilities: ["Collection summary", "Arrears aging", "Invoice reports", "Payment reports", "Reconciliation"]
  },
  help: {
    title: "Help & Support",
    group: "Support",
    description: "Find guidance, contact support and review school workspace notices.",
    action: "Contact support",
    tabs: ["Help center", "Guides", "Support requests", "System notices"],
    columns: ["Topic", "Category", "Updated", "Owner", "Status"],
    workflow: ["Search guidance", "Review solution", "Open support request", "Track response", "Close request"],
    capabilities: ["Guides", "Support requests", "System notices", "Contact support"]
  }
};

function getModuleKey(parts: string[]): string {
  return parts.join("/").toLowerCase();
}

export default async function SchoolModulePage({ params }: { params: Promise<{ module: string[] }> }) {
  const session = await getSchoolSession();
  if (!session) redirect("/login/school");

  const moduleKey = getModuleKey((await params).module);
  const config = modules[moduleKey];
  if (!config) redirect("/dashboard");

  const href = "/school/" + moduleKey;

  return (
    <AppShell
      universe="school"
      title={config.title}
      subtitle={session.name}
      active={config.title}
      userName={session.name}
      schoolCode={session.schoolId}
    >
      <section className="workspace-page">
        <div className="workspace-page-head">
          <div>
            <span className="workspace-eyebrow">{config.group}</span>
            <h2>{config.title}</h2>
            <p>{config.description}</p>
          </div>
          <div className="workspace-page-actions">
            <Link className="workspace-secondary-action" href="/dashboard">Back to overview</Link>
            <Link className="workspace-primary-action" href={`${href}?action=create`}>{config.action} →</Link>
          </div>
        </div>

        <div className="workspace-tabs" role="tablist" aria-label={`${config.title} views`}>
          {config.tabs.map((tab, index) => (
            <Link key={tab} className={`workspace-tab ${index === 0 ? "is-active" : ""}`} href={`${href}?view=${encodeURIComponent(tab)}`}>
              {tab}
            </Link>
          ))}
        </div>

        <div className="workspace-kpis">
          <article><small>Total records</small><strong>0</strong><span>Awaiting your school's first entry</span></article>
          <article><small>Active workflow</small><strong>1</strong><span>{config.workflow[0]}</span></article>
          <article><small>Available capabilities</small><strong>{config.capabilities.length}</strong><span>Designed for school operations</span></article>
        </div>

        <div className="workspace-grid">
          <section className="workspace-card workspace-table-card">
            <div className="workspace-card-head">
              <div><h3>Records</h3><p>Only real school records will appear here.</p></div>
              <Link href={`${href}?action=create`} className="workspace-compact-action">+ {config.action}</Link>
            </div>
            <div className="workspace-table-wrap">
              <table className="workspace-table">
                <thead><tr>{config.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                <tbody><tr><td colSpan={config.columns.length}><div className="workspace-empty"><span className="workspace-empty-icon">＋</span><h4>No records yet</h4><p>This school workspace is intentionally empty until you add or import real data.</p><Link href={`${href}?action=create`} className="workspace-primary-action">{config.action} →</Link></div></td></tr></tbody>
              </table>
            </div>
          </section>

          <aside className="workspace-side-column">
            <section className="workspace-card">
              <div className="workspace-card-head"><div><h3>Workflow</h3><p>Recommended operational flow</p></div></div>
              <ol className="workspace-workflow">
                {config.workflow.map((step, index) => <li key={step}><span>{index + 1}</span><div><b>{step}</b>{index === 0 ? <small>Start here</small> : null}</div></li>)}
              </ol>
            </section>
            <section className="workspace-card">
              <div className="workspace-card-head"><div><h3>Capabilities</h3><p>What this module will manage</p></div></div>
              <div className="workspace-capabilities">{config.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div>
            </section>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
