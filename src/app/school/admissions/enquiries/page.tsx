import { redirect } from "next/navigation";
import { createId } from "@paralleldrive/cuid2";
import Link from "next/link";
import { randomInt } from "node:crypto";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { admissionStatusLabel } from "@/lib/admissions-v2";
import "./enquiries.css";

const STAGES = [
  ["new", "New"], ["contacted", "Contacted"], ["interested", "Interested"],
  ["visit", "Visit / Interview"], ["applied", "Application started"], ["converted", "Enrolled"],
] as const;
const SOURCES = ["walk_in", "phone", "website", "referral", "social", "event", "other"] as const;
const ALLOWED: Record<string, string[]> = {
  new: ["contacted", "interested", "visit", "applied"],
  contacted: ["interested", "visit", "applied"],
  interested: ["visit", "applied"],
  visit: ["applied"],
  applied: [],
  converted: [],
};

function label(value: string) {
  const found = [...STAGES, ...SOURCES.map((source) => [source, source.replaceAll("_", " ")] as const)].find(([key]) => key === value);
  return found?.[1] ?? value;
}
function reference() { return `ENQ-${new Date().getFullYear()}-${String(randomInt(1000, 9999))}`; }
function dateValue(value: FormDataEntryValue | null) { return typeof value === "string" && value ? new Date(value) : null; }

async function createEnquiry(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    const studentName = String(formData.get("studentName") ?? "").trim();
    if (!studentName) throw new Error("Learner name is required.");
    let ref = reference();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const exists = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "AdmissionEnquiry" WHERE "schoolId"=$1 AND "reference"=$2 LIMIT 1`, session.schoolId, ref);
      if (!exists.length) break;
      ref = reference();
    }
    const id = createId();
    const guardianName = String(formData.get("guardianName") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
    const intendedClass = String(formData.get("intendedClass") ?? "").trim() || null;
    const sourceRaw = String(formData.get("source") ?? "walk_in");
    const source = SOURCES.includes(sourceRaw as typeof SOURCES[number]) ? sourceRaw : "other";
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const nextFollowUpAt = dateValue(formData.get("nextFollowUpAt"));
    await tx.$executeRawUnsafe(`INSERT INTO "AdmissionEnquiry" ("id","schoolId","reference","studentName","guardianName","phone","email","intendedClass","source","stage","notes","nextFollowUpAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',$10,$11)`, id, session.schoolId, ref, studentName, guardianName, phone, email, intendedClass, source, notes, nextFollowUpAt);
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "admission_enquiry.created", entityType: "AdmissionEnquiry", entityId: id, after: { reference: ref, studentName, source } } });
  });
  redirect("/school/admissions/enquiries");
}

async function advanceEnquiry(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const id = String(formData.get("id") ?? "");
  const to = String(formData.get("stage") ?? "");
  const followUp = dateValue(formData.get("nextFollowUpAt"));
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `admission-enquiry:${session.schoolId}:${id}`);
    const rows = await tx.$queryRawUnsafe<Array<{ stage: string; convertedStudentId: string | null }>>(`SELECT "stage","convertedStudentId" FROM "AdmissionEnquiry" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1 FOR UPDATE`, id, session.schoolId);
    const current = rows[0];
    if (!current) throw new Error("Enquiry not found.");
    if (current.convertedStudentId || current.stage === "converted") throw new Error("Enrolled enquiries are historical and cannot be moved back.");
    if (!(ALLOWED[current.stage] ?? []).includes(to)) throw new Error(`Cannot move this enquiry from ${label(current.stage)} to ${label(to)}.`);
    await tx.$executeRawUnsafe(`UPDATE "AdmissionEnquiry" SET "stage"=$1,"nextFollowUpAt"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$3 AND "schoolId"=$4`, to, followUp, id, session.schoolId);
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "admission_enquiry.updated", entityType: "AdmissionEnquiry", entityId: id, before: { stage: current.stage }, after: { stage: to } } });
  });
  redirect("/school/admissions/enquiries");
}

type EnquiryRow = { id:string; reference:string; studentName:string; guardianName:string|null; phone:string|null; email:string|null; intendedClass:string|null; source:string; stage:string; nextFollowUpAt:Date|null; notes:string|null; convertedStudentId:string|null; createdAt:Date };
type AppLink = { id: string; enquiryId: string; reference: string; status: string };

export default async function AdmissionsEnquiriesPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const q = String(params.q ?? "").trim().toLowerCase();
  const view = String(params.view ?? "all");
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, enquiries, applicationLinks] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.$queryRawUnsafe<EnquiryRow[]>(`SELECT "id","reference","studentName","guardianName","phone","email","intendedClass","source","stage","nextFollowUpAt","notes","convertedStudentId","createdAt" FROM "AdmissionEnquiry" WHERE "schoolId"=$1 ORDER BY COALESCE("nextFollowUpAt","createdAt") ASC LIMIT 500`, session.schoolId),
      tx.$queryRawUnsafe<AppLink[]>(`SELECT "id","enquiryId","reference","status" FROM "AdmissionApplication" WHERE "schoolId"=$1 AND "enquiryId" IS NOT NULL`, session.schoolId),
    ]);
    return { school, enquiries, applicationLinks };
  });
  const applicationByEnquiry = new Map(data.applicationLinks.map((item) => [item.enquiryId, item]));
  const filtered = data.enquiries.filter((item) => {
    if (view !== "all" && item.stage !== view) return false;
    if (!q) return true;
    return [item.studentName, item.guardianName ?? "", item.phone ?? "", item.reference, item.intendedClass ?? ""].some((value) => value.toLowerCase().includes(q));
  });
  const counts = Object.fromEntries(STAGES.map(([stage]) => [stage, data.enquiries.filter((item) => item.stage === stage).length]));
  const converted = counts.converted ?? 0;
  const rate = data.enquiries.length ? Math.round(converted / data.enquiries.length * 100) : 0;

  return <AppShell universe="school" title="Admissions Enquiries" subtitle="Prospective families before a formal application." active="Enquiries" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="enquiries-page">
      <section className="enquiries-hero"><div><span className="eyebrow">Admissions · enquiry desk</span><h2>First contact stays separate from formal admission.</h2><p>Qualify the family here, then start the standard application. This desk never creates an official student directly.</p></div><div className="enquiries-hero-actions"><Link href="/school/admissions/applications" className="button secondary">Applications</Link><a href="#new-enquiry" className="button primary">+ New enquiry</a></div></section>
      <section className="enquiry-kpis"><article><span>Total enquiries</span><strong>{data.enquiries.length}</strong><small>All historical contacts</small></article><article><span>Applied</span><strong>{counts.applied ?? 0}</strong><small>Ready for formal application</small></article><article><span>Enrolled</span><strong>{converted}</strong><small>Completed admissions</small></article><article className={rate >= 30 ? "good" : ""}><span>Conversion</span><strong>{rate}%</strong><small>Enquiry → enrolled learner</small></article></section>
      <section className="enquiry-pipeline"><div className="pipeline-head"><div><span className="eyebrow">Pipeline</span><h3>Where prospective families stand</h3></div></div><div className="pipeline-grid">{STAGES.map(([stage, name]) => <Link href={`/school/admissions/enquiries?view=${stage}`} className={`pipeline-stage ${view===stage ? "active" : ""}`} key={stage}><span>{name}</span><strong>{counts[stage] ?? 0}</strong><small>{stage === "applied" ? "Continue into formal application" : stage === "converted" ? "Official learner created" : "Admissions follow-up"}</small></Link>)}</div></section>
      <section className="enquiry-board"><div className="board-head"><div><span className="eyebrow">Enquiry register</span><h3>Prospective learners</h3><p>{filtered.length} record{filtered.length === 1 ? "" : "s"} in this view.</p></div></div><form className="enquiry-search" action="/school/admissions/enquiries"><input name="q" defaultValue={params.q ?? ""} placeholder="Search learner, guardian, phone or enquiry number"/>{view !== "all" ? <input type="hidden" name="view" value={view}/> : null}<button className="button secondary" type="submit">Search</button></form>
        {filtered.length ? <div className="enquiry-list">{filtered.map((item) => { const application = applicationByEnquiry.get(item.id); const nextStages = ALLOWED[item.stage] ?? []; return <article className="enquiry-row" key={item.id}><div className="enquiry-identity"><span className="enquiry-avatar">{item.studentName.slice(0,2).toUpperCase()}</span><div><div className="enquiry-ref">{item.reference}</div><h4>{item.studentName}</h4><p>{item.guardianName ?? "Guardian not recorded"}{item.phone ? ` · ${item.phone}` : ""}</p></div></div><div className="enquiry-meta"><span className="stage-pill">{label(item.stage)}</span><strong>{item.intendedClass ?? "Class not chosen"}</strong><small>{label(item.source)}</small></div><div className="enquiry-next">{application ? <><span>Formal application</span><strong>{application.reference}</strong><small>{admissionStatusLabel(application.status)}</small></> : item.nextFollowUpAt ? <><span>Next follow-up</span><strong>{new Date(item.nextFollowUpAt).toLocaleDateString("en-GH")}</strong></> : <span>No follow-up scheduled</span>}</div><div className="enquiry-actions">{application ? <Link className="button primary" href={`/school/admissions/applications/${application.id}`}>Open application</Link> : item.stage === "applied" ? <Link className="button primary" href={`/school/admissions/applications/new?enquiryId=${encodeURIComponent(item.id)}`}>Start application</Link> : nextStages.length ? <form action={advanceEnquiry}><input type="hidden" name="id" value={item.id}/><select name="stage" defaultValue={nextStages[0]}>{nextStages.map((stage) => <option key={stage} value={stage}>Move to {label(stage)}</option>)}</select><button className="button secondary" type="submit">Update</button></form> : item.convertedStudentId ? <Link className="button secondary" href={`/school/students/${item.convertedStudentId}`}>Open student</Link> : null}</div></article>; })}</div> : <div className="enquiry-empty"><strong>No enquiries found.</strong></div>}
      </section>
      <section className="enquiry-board" id="new-enquiry"><div className="board-head"><div><span className="eyebrow">New enquiry</span><h3>Record a prospective family</h3><p>This is a lightweight first-contact record. Use a formal application when the family is ready.</p></div></div><form action={createEnquiry} className="enquiry-form"><label>Learner name<input name="studentName" required/></label><label>Guardian name<input name="guardianName"/></label><label>Phone<input name="phone" inputMode="tel"/></label><label>Email<input type="email" name="email"/></label><label>Intended class<input name="intendedClass"/></label><label>Source<select name="source" defaultValue="walk_in">{SOURCES.map((source) => <option key={source} value={source}>{label(source)}</option>)}</select></label><label>Next follow-up<input type="datetime-local" name="nextFollowUpAt"/></label><label className="wide">Notes<textarea name="notes" rows={4}/></label><div className="wide"><button className="button primary" type="submit">Save enquiry</button></div></form></section>
    </div>
  </AppShell>;
}
