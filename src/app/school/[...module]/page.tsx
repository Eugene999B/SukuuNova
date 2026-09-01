import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { getSchoolAuthorization } from "@/lib/authorization";
import StaffAttendanceDesk from "../StaffAttendanceDesk";

type ModuleConfig = { title: string; subtitle: string; action: string; tabs: string[] };

const configs: Record<string, ModuleConfig> = {
  students:{title:"Students",subtitle:"Manage enrolment, placement, attendance, learning and learner records.",action:"Add student",tabs:["All","Active","Pending","Graduated","Archived"]},
  guardians:{title:"Parents & Guardians",subtitle:"Manage family relationships, contact details and portal access.",action:"Add guardian",tabs:["All","Primary","Portal access","Needs attention"]},
  staff:{title:"Staff & Teachers",subtitle:"Manage staff records, assignments, attendance and access.",action:"Add staff",tabs:["All staff","Teachers","Administrators","Support","Inactive"]},
  "admissions/enquiries":{title:"Admissions Enquiries",subtitle:"Manage new enquiries, follow-ups and conversions.",action:"New enquiry",tabs:["Pipeline","New","Follow-up","Qualified","Converted","Closed"]},
  "admissions/applications":{title:"Applications",subtitle:"Review applications, documents and admission decisions.",action:"New application",tabs:["All","Draft","Submitted","Review","Accepted","Rejected"]},
  "admissions/enrolment":{title:"Enrolment",subtitle:"Turn accepted applications into active school records.",action:"Start enrolment",tabs:["Ready","In progress","Completed","Withdrawn"]},
  classes:{title:"Classes & Houses",subtitle:"Manage classes, streams, houses, capacity and placement.",action:"Create class",tabs:["Classes","Houses","Streams","Class teachers","Capacity"]},
  subjects:{title:"Subjects & Curriculum",subtitle:"Manage subjects, curriculum mapping and teacher ownership.",action:"Add subject",tabs:["Subjects","Core","Electives","Curriculum","Unassigned"]},
  timetable:{title:"Timetable",subtitle:"Build and publish schedules while checking teacher and room clashes.",action:"Add timetable slot",tabs:["Week","Classes","Teachers","Rooms","Substitutes","Conflicts"]},
  lessons:{title:"Lessons & Planning",subtitle:"Plan lessons, schemes, resources and completion.",action:"Create lesson",tabs:["This week","Planned","Completed","Schemes","Resources"]},
  homework:{title:"Homework & Exercises",subtitle:"Create work, assign it, collect submissions and mark.",action:"Create exercise",tabs:["Draft","Assigned","Due","Submitted","Reviewed"]},
  gradebook:{title:"Gradebook",subtitle:"Enter, validate, moderate and publish academic results.",action:"Open gradebook",tabs:["Classes","Subjects","Missing scores","Moderation","Published"]},
  exams:{title:"Exams & Assessments",subtitle:"Set up assessments, schedules, marks and result release.",action:"Create assessment",tabs:["Assessments","Schedule","Mark entry","Moderation","Results"]},
  "report-cards":{title:"Report Cards",subtitle:"Generate, review, approve, publish and archive learner reports.",action:"Generate reports",tabs:["Draft","For review","Approved","Published","Templates"]},
  attendance:{title:"Student Attendance",subtitle:"Run class registers and resolve attendance exceptions.",action:"Take attendance",tabs:["Today","Register","History","Absences","Late","Exceptions"]},
  "staff-attendance":{title:"Staff Attendance",subtitle:"Record and review staff presence, lateness and absence.",action:"Open register",tabs:["Today","Register","History","Late","Absent"]},
  "attendance/exceptions":{title:"Late & Absence",subtitle:"Resolve attendance exceptions and follow-up actions.",action:"Review queue",tabs:["All","Unresolved","Late","Absence","Resolved"]},
  fees:{title:"School Fees",subtitle:"Manage fee structures, billing, collections and arrears.",action:"Create fee item",tabs:["Overview","Fee structures","Billing","Collections","Arrears"]},
  "fees/invoices":{title:"Invoices",subtitle:"Create invoices, track balances and follow up overdue accounts.",action:"Create invoice",tabs:["All","Unpaid","Part-paid","Paid","Overdue"]},
  "fees/payments":{title:"Payments & Receipts",subtitle:"Record payments, reconcile collections and issue receipts.",action:"Record payment",tabs:["Today","Recent","Unreconciled","Receipts","Reversed"]},
  "fees/arrears":{title:"Arrears & Balances",subtitle:"Prioritise outstanding accounts and payment actions.",action:"Review arrears",tabs:["All owing","Due soon","Overdue","High balance","Cleared"]},
  "communications/messages":{title:"Messages",subtitle:"Send and manage targeted school communications.",action:"Compose message",tabs:["Inbox","Sent","Queued","Failed","Templates"]},
  "communications/announcements":{title:"Announcements",subtitle:"Publish targeted school announcements and notices.",action:"Create announcement",tabs:["Draft","Scheduled","Published","Expired"]},
  "communications/broadcasts":{title:"SMS & WhatsApp",subtitle:"Prepare, send and monitor external broadcasts.",action:"Create broadcast",tabs:["Compose","Queued","Sent","Failed","Templates"]},
  events:{title:"Events & Calendar",subtitle:"Coordinate academic, parent and operational events.",action:"Create event",tabs:["Calendar","Upcoming","Academic","Parent","Operational"]},
  library:{title:"Library",subtitle:"Manage books, loans, returns and overdue items.",action:"Add book",tabs:["Catalogue","Borrowed","Due soon","Overdue","Returns"]},
  transport:{title:"Transport",subtitle:"Manage routes, vehicles, drivers, stops and assignments.",action:"Create route",tabs:["Routes","Vehicles","Stops","Drivers","Assignments"]},
  feeding:{title:"Feeding & Meals",subtitle:"Plan meals and manage daily feeding operations.",action:"Create meal plan",tabs:["Today","Menu","Service","History"]},
  inventory:{title:"Assets & Inventory",subtitle:"Track assets, stock, assignments, maintenance and retirement.",action:"Add asset",tabs:["Assets","Stock","Assigned","Maintenance","Retired"]},
  "hr/recruitment":{title:"Recruitment",subtitle:"Manage vacancies, applicants, interviews and offers.",action:"Create vacancy",tabs:["Open","Applicants","Interview","Offer","Closed"]},
  "reports/analytics":{title:"School Analytics",subtitle:"Monitor school performance across the main operating areas.",action:"Configure dashboard",tabs:["Overview","Students","Attendance","Academics","Finance","Operations"]},
  reports:{title:"Reports",subtitle:"Run operational, academic, attendance and finance reports.",action:"Create report",tabs:["Recent","Scheduled","Academic","Attendance","Finance","Management"]},
  "settings/roles":{title:"Roles & Permissions",subtitle:"Manage roles, permissions and assignments.",action:"Create role",tabs:["Roles","Permissions","Assignments","Audit"]},
  settings:{title:"School Settings",subtitle:"Manage school identity, operating rules and academic calendar.",action:"Save settings",tabs:["General","Academic","Terms"]},
  search:{title:"Search",subtitle:"Find a student, guardian, staff member, subject, invoice or message.",action:"Search",tabs:[]},
  help:{title:"Help & Support",subtitle:"Find guides and manage support requests.",action:"Contact support",tabs:["Guides","Requests","Updates"]}
};

const teacherAllowedModules = new Set(["classes","subjects","timetable","lessons","homework","gradebook","exams","report-cards","attendance","communications/messages","communications/announcements","search","help"]);

const searchCategories = [
  { icon:"♟", title:"People", text:"Students, guardians, staff and teachers", links:[["Students","/school/students"],["Guardians","/school/guardians"],["Staff & Teachers","/school/staff"]] },
  { icon:"▤", title:"Academics", text:"Classes, subjects, timetable and results", links:[["Classes","/school/classes"],["Subjects","/school/subjects"],["Gradebook","/school/gradebook"],["Report Cards","/school/report-cards"]] },
  { icon:"₵", title:"Finance", text:"Fees, invoices, payments and balances", links:[["School Fees","/school/fees"],["Invoices","/school/fees/invoices"],["Payments","/school/fees/payments"],["Arrears","/school/fees/arrears"]] },
  { icon:"✉", title:"Communication", text:"Messages, announcements, broadcasts and events", links:[["Messages","/school/communications/messages"],["Announcements","/school/communications/announcements"],["Events","/school/events"]] },
] as const;

export default async function SchoolModulePage({params}:{params:Promise<{module?:string[]}>}) {
  const session = await requireSchoolSession();
  const { module = [] } = await params;
  const key = module.join("/");
  const config = configs[key];
  if (!config) notFound();

  const school = await withTenant(session.schoolId, async (tx) => {
    const [schoolRecord, access] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      getSchoolAuthorization(tx, session.userId),
    ]);
    return { school: schoolRecord, access };
  });
  if (!school.school) notFound();

  const isTeacher = school.access.workspace === "teacher";
  if (isTeacher && !teacherAllowedModules.has(key)) redirect("/teacher");

  if (key === "staff-attendance") {
    return <AppShell universe={isTeacher ? "teacher" : "school"} title={config.title} subtitle={config.subtitle} active={config.title} schoolName={school.school.name} schoolCode={school.school.uniqueCode} userName={session.name}>
      <StaffAttendanceDesk />
    </AppShell>;
  }
  if (key === "search") return <SearchCentre schoolName={school.school.name} sessionName={session.name} teacherMode={isTeacher} />;

  return <AppShell universe={isTeacher ? "teacher" : "school"} title={config.title} subtitle={config.subtitle} active={config.title} schoolName={school.school.name} schoolCode={school.school.uniqueCode} userName={session.name}>
    <div className="module-shell">
      <section className="module-hero"><div><span className="eyebrow">{school.school.name}</span><h2>{config.title}</h2><p>{config.subtitle}</p></div><div className="module-actions"><Link className="button secondary" href="/school/reports/analytics">View analytics</Link><Link className="button secondary" href="/school/terms">Term context</Link></div></section>
      <nav className="module-tabs" aria-label={`${config.title} views`} aria-disabled="true">{config.tabs.map((tab) => <span key={tab} className="module-tab" aria-disabled="true">{tab}</span>)}</nav>
      <section className="module-layout"><div className="module-panel"><div className="module-empty"><span className="eyebrow">Prototype / placeholder</span><strong>Workflow not connected yet</strong><span>This route is intentionally read-only. No create, edit, search, or record change is exposed here until this module is backed by a real operational workflow.</span><div className="module-actions"><Link className="button secondary" href="/school/reports/analytics">View school analytics</Link><Link className="button secondary" href="/school/terms">Review term context</Link></div></div></div><aside className="module-side-card"><div className="module-side-card-head"><h3>Module status</h3><span>Read-only</span></div><div className="module-list"><div className="module-list-item"><span className="module-list-index">1</span><span>Data changes</span><span>Disabled</span></div><div className="module-list-item"><span className="module-list-index">2</span><span>Search</span><span>Not connected</span></div><div className="module-list-item"><span className="module-list-index">3</span><span>Record workflow</span><span>Not connected</span></div><div className="module-list-item"><span className="module-list-index">4</span><span>Role-safe fallback</span><span>Active</span></div></div></aside></section>
    </div>
  </AppShell>;
}

function SearchCentre({schoolName,sessionName,teacherMode}:{schoolName:string;sessionName:string;teacherMode:boolean}) {
  const categories = teacherMode ? searchCategories.filter((category) => category.title === "People" || category.title === "Academics" || category.title === "Communication") : searchCategories;
  return <AppShell universe={teacherMode ? "teacher" : "school"} title="Search" subtitle="Find something you need in this school workspace." active="Search" schoolName={schoolName} userName={sessionName}>
    <div className="module-shell search-centre">
      <section className="search-hero"><div><span className="eyebrow">{schoolName}</span><h2>Search index not connected yet.</h2><p>Use the direct module links below until a tenant-scoped global search index is wired into this workspace.</p></div></section>
      <div className="search-category-grid">{categories.map((category) => <section className="search-category" key={category.title}><div className="search-category-icon">{category.icon}</div><div className="search-category-head"><h3>{category.title}</h3><p>{category.text}</p></div><div className="search-category-links">{category.links.map(([label,href]) => <Link href={href} key={label}>{label}<span>→</span></Link>)}</div></section>)}</div>
      <section className="search-tip"><span>⌕</span><div><strong>Global search is intentionally read-only.</strong><p>No search request is submitted from this screen until a real tenant-scoped index is available.</p></div></section>
    </div>
  </AppShell>;
}
