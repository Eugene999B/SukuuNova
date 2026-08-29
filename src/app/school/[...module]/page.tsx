import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import StaffAttendanceDesk from "../StaffAttendanceDesk";

type ModuleConfig = { title:string; subtitle:string; action:string; tabs:string[] };

const configs:Record<string,ModuleConfig> = {
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
 search:{title:"Global Search",subtitle:"Find authorised school records quickly.",action:"Search",tabs:["All","People","Academics","Finance","Communication"]},
 help:{title:"Help & Support",subtitle:"Find guides and manage support requests.",action:"Contact support",tabs:["Guides","Requests","Updates"]}
};

export default async function SchoolModulePage({params}:{params:Promise<{module?:string[]}>}){
 const session=await requireSchoolSession();
 const {module=[]}=await params;
 const key=module.join("/");
 const config=configs[key];
 if(!config) notFound();
 const school=await withTenant(session.schoolId,tx=>tx.school.findUnique({where:{id:session.schoolId},select:{name:true,uniqueCode:true}}));
 if(!school) notFound();
 if(key==="staff-attendance") return <AppShell universe="school" title={config.title} subtitle={config.subtitle} active={config.title} schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}><StaffAttendanceDesk /></AppShell>;
 const base=`/school/${key}`;
 return <AppShell universe="school" title={config.title} subtitle={config.subtitle} active={config.title} schoolName={school.name} schoolCode={school.uniqueCode} userName={session.name}>
  <div className="module-shell">
   <section className="module-hero"><div><span className="eyebrow">{school.name}</span><h2>{config.title}</h2><p>{config.subtitle}</p></div><div className="module-actions"><Link className="button secondary" href="/school/reports/analytics">Analytics</Link><Link className="button primary" href={`${base}?action=create`}>{config.action}</Link></div></section>
   <nav className="module-tabs" aria-label={`${config.title} views`}>{config.tabs.map(tab=><Link key={tab} href={`${base}?view=${encodeURIComponent(tab)}`} className="module-tab">{tab}</Link>)}</nav>
   <section className="module-layout"><div className="module-panel"><div className="module-toolbar"><form className="module-search" action={base}><input name="q" placeholder={`Search ${config.title.toLowerCase()}…`} /><button className="button secondary" type="submit">Search</button></form><Link className="button secondary" href="/school/terms">Term context</Link></div><div className="module-table-wrap"><table className="module-table"><thead><tr><th>Record</th><th>Status</th><th>Last activity</th><th /></tr></thead><tbody><tr><td colSpan={4}><div className="module-empty"><strong>No records in this view</strong><span>Use the action above to create or open work.</span><Link className="button primary" href={`${base}?action=create`}>{config.action}</Link></div></td></tr></tbody></table></div></div><aside className="module-side-card"><div className="module-side-card-head"><h3>Work queue</h3><span>{session.name}</span></div><div className="module-list">{config.tabs.slice(0,4).map((tab,index)=><Link key={tab} href={`${base}?view=${encodeURIComponent(tab)}`} className="module-list-item"><span className="module-list-index">{index+1}</span><span>{tab}</span><span>→</span></Link>)}</div></aside></section>
  </div>
 </AppShell>;
}
