import { redirect } from "next/navigation";
import { createId } from "@paralleldrive/cuid2";
import Link from "next/link";
import { randomInt } from "node:crypto";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { requirePermission } from "@/lib/rbac";
import { withTenant } from "@/lib/db";
import { ensureIdentityCardsForSchool } from "@/lib/identity-card-service";
import "./enquiries.css";

const STAGES = [
  ["new", "New"], ["contacted", "Contacted"], ["interested", "Interested"],
  ["visit", "Visit / Interview"], ["applied", "Applied"], ["converted", "Enrolled"],
] as const;
const SOURCES = ["walk_in", "phone", "website", "referral", "social", "event", "other"] as const;

function label(value: string) {
  const found = [...STAGES, ...SOURCES.map((s) => [s, s.replaceAll("_", " ")] as const)].find(([key]) => key === value);
  return found?.[1] ?? value;
}
function reference() { return `ENQ-${new Date().getFullYear()}-${String(randomInt(1000, 9999))}`; }
function dateValue(value: FormDataEntryValue | null) { return typeof value === "string" && value ? new Date(value) : null; }

async function createEnquiry(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    let ref = reference();
    for (let i = 0; i < 5; i++) {
      const exists = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "AdmissionEnquiry" WHERE "schoolId"=$1 AND "reference"=$2 LIMIT 1`, session.schoolId, ref);
      if (!exists.length) break;
      ref = reference();
    }
    const row = {
      id: createId(), schoolId: session.schoolId, reference: ref,
      studentName: String(formData.get("studentName") ?? "").trim(),
      guardianName: String(formData.get("guardianName") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim().toLowerCase() || null,
      intendedClass: String(formData.get("intendedClass") ?? "").trim() || null,
      source: SOURCES.includes(String(formData.get("source") ?? "other") as typeof SOURCES[number]) ? String(formData.get("source")) : "other",
      stage: "new", notes: String(formData.get("notes") ?? "").trim() || null,
      nextFollowUpAt: dateValue(formData.get("nextFollowUpAt")),
    };
    if (!row.studentName) throw new Error("Student name is required.");
    await tx.$executeRawUnsafe(`INSERT INTO "AdmissionEnquiry" ("id","schoolId","reference","studentName","guardianName","phone","email","intendedClass","source","stage","notes","nextFollowUpAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, row.id,row.schoolId,row.reference,row.studentName,row.guardianName,row.phone,row.email,row.intendedClass,row.source,row.stage,row.notes,row.nextFollowUpAt);
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "admission_enquiry.created", entityType: "AdmissionEnquiry", entityId: row.id, after: { reference: row.reference, studentName: row.studentName, source: row.source } } });
  });
  redirect("/school/admissions/enquiries");
}

async function updateEnquiry(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const id = String(formData.get("id") ?? "");
  const stage = String(formData.get("stage") ?? "new");
  const followUp = dateValue(formData.get("nextFollowUpAt"));
  if (!STAGES.some(([key]) => key === stage)) throw new Error("Invalid enquiry stage.");
  if (stage === "converted") throw new Error("Use Enrol student to convert an application. Stages cannot jump directly to enrolled.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `admission-enquiry:${session.schoolId}:${id}`);
    const current = await tx.$queryRawUnsafe<Array<{ stage: string; convertedStudentId: string | null }>>(`SELECT "stage","convertedStudentId" FROM "AdmissionEnquiry" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1`, id, session.schoolId);
    const from = current[0]?.stage;
    if (!from) throw new Error("Enquiry not found.");
    if (from === "converted" || current[0]?.convertedStudentId) throw new Error("Converted enquiries cannot be moved back.");
    const allowed: Record<string, string[]> = { new: ["contacted", "interested", "visit", "applied"], contacted: ["interested", "visit", "applied"], interested: ["visit", "applied"], visit: ["applied"], applied: [] };
    if (from !== stage && !(allowed[from] ?? []).includes(stage)) throw new Error(`Cannot move an enquiry from ${from} to ${stage}.`);
    await tx.$executeRawUnsafe(`UPDATE "AdmissionEnquiry" SET "stage"=$1,"nextFollowUpAt"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$3 AND "schoolId"=$4`, stage, followUp, id, session.schoolId);
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "admission_enquiry.updated", entityType: "AdmissionEnquiry", entityId: id, before: { stage: from }, after: { stage, nextFollowUpAt: followUp?.toISOString() ?? null } } });
  });
  redirect("/school/admissions/enquiries");
}

async function convertEnquiry(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const id = String(formData.get("id") ?? "");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `admission-enquiry:${session.schoolId}:${id}`);
    const rows = await tx.$queryRawUnsafe<Array<{ id:string; studentName:string; guardianName:string|null; phone:string|null; email:string|null; stage:string; convertedStudentId:string|null }>>(`SELECT "id","studentName","guardianName","phone","email","stage","convertedStudentId" FROM "AdmissionEnquiry" WHERE "id"=$1 AND "schoolId"=$2 LIMIT 1 FOR UPDATE`, id, session.schoolId);
    const enquiry = rows[0];
    if (!enquiry) throw new Error("Enquiry not found.");
    if (enquiry.convertedStudentId) throw new Error("This enquiry has already been converted. Open the linked student instead.");
    if (enquiry.stage !== "applied") throw new Error("Only applications at Applied stage can be enrolled. Move the enquiry to Applied first.");
    let admissionNo = `ADM-${new Date().getFullYear()}-${randomInt(1000, 9999)}`;
    for (let i = 0; i < 6; i++) {
      const hit = await tx.student.findUnique({ where: { schoolId_admissionNo: { schoolId: session.schoolId, admissionNo } }, select: { id: true } });
      if (!hit) break;
      admissionNo = `ADM-${new Date().getFullYear()}-${randomInt(1000, 9999)}`;
    }
    let student;
    try {
      student = await tx.student.create({ data: { schoolId: session.schoolId, name: enquiry.studentName, admissionNo, status: "active" } });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new Error("A student with this index number was just created. Try again.");
      throw error;
    }
    if (enquiry.guardianName && enquiry.phone) {
      const guardian = await tx.guardian.upsert({ where: { schoolId_phone: { schoolId: session.schoolId, phone: enquiry.phone } }, update: { name: enquiry.guardianName }, create: { schoolId: session.schoolId, name: enquiry.guardianName, phone: enquiry.phone } });
      const { linkGuardianToStudent } = await import("@/lib/guardian-service");
      await linkGuardianToStudent(tx, { schoolId: session.schoolId, studentId: student.id, guardianId: guardian.id, relationship: "Parent/Guardian" });
    }
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { uniqueCode: true } });
    if (!school?.uniqueCode) throw new Error("The school's identification code is missing.");
    await ensureIdentityCardsForSchool(tx, session.schoolId, school.uniqueCode, session.userId);
    await tx.$executeRawUnsafe(`UPDATE "AdmissionEnquiry" SET "stage"='converted',"convertedStudentId"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2 AND "schoolId"=$3 AND "convertedStudentId" IS NULL`, student.id, id, session.schoolId);
    await tx.auditLogSchool.create({ data: { schoolId: session.schoolId, actorId: session.userId, action: "admission_enquiry.converted", entityType: "AdmissionEnquiry", entityId: id, after: { studentId: student.id, admissionNo } } });
  });
  redirect("/school/admissions/enquiries");
}

export default async function AdmissionsEnquiriesPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const view = String(params.view ?? "all");
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const school = await tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } });
    const textFilter = q ? ` AND (LOWER("studentName") LIKE LOWER($2) OR LOWER(COALESCE("guardianName",'')) LIKE LOWER($2) OR LOWER(COALESCE("phone",'')) LIKE LOWER($2) OR "reference" ILIKE $2)` : "";
    const stageFilter = view !== "all" && STAGES.some(([k]) => k === view) ? ` AND "stage"=$${q ? 3 : 2}` : "";
    const args: unknown[] = q ? [session.schoolId, `%${q}%`] : [session.schoolId];
    if (stageFilter) args.push(view);
    const enquiries = await tx.$queryRawUnsafe<Array<{ id:string; reference:string; studentName:string; guardianName:string|null; phone:string|null; email:string|null; intendedClass:string|null; source:string; stage:string; nextFollowUpAt:Date|null; lastContactAt:Date|null; visitAt:Date|null; notes:string|null; convertedStudentId:string|null; createdAt:Date }>>(`SELECT "id","reference","studentName","guardianName","phone","email","intendedClass","source","stage","nextFollowUpAt","lastContactAt","visitAt","notes","convertedStudentId","createdAt" FROM "AdmissionEnquiry" WHERE "schoolId"=$1${textFilter}${stageFilter} ORDER BY COALESCE("nextFollowUpAt","createdAt") ASC LIMIT 250`, ...args);
    return { school, enquiries };
  });
  const counts = Object.fromEntries(STAGES.map(([stage]) => [stage, data.enquiries.filter((e) => e.stage === stage).length]));
  const followUps = [...data.enquiries].filter((e) => e.nextFollowUpAt).sort((a,b) => Number(new Date(a.nextFollowUpAt!)) - Number(new Date(b.nextFollowUpAt!))).slice(0,6);
  const total = data.enquiries.length;
  const converted = counts.converted ?? 0;
  const active = total - converted;
  const rate = total ? Math.round((converted / total) * 100) : 0;

  return <AppShell universe="school" title="Admissions Enquiries" subtitle="Capture every prospective family, follow the conversation, and move qualified enquiries toward enrolment." active="Enquiries" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="enquiries-page">
      <section className="enquiries-hero">
        <div><span className="eyebrow">Admissions · Enquiry desk</span><h2>Turn first contact into a clear next step.</h2><p>Keep every prospective learner in one place—from the first phone call or walk-in to visit, application and enrolment.</p></div>
        <div className="enquiries-hero-actions"><Link href="/school/admissions/applications" className="button secondary">Applications</Link><a href="#new-enquiry" className="button primary">+ New enquiry</a></div>
      </section>

      <section className="enquiry-kpis"><article><span>Open enquiries</span><strong>{active}</strong><small>Still being worked</small></article><article><span>Needs follow-up</span><strong>{followUps.length}</strong><small>Scheduled in this view</small></article><article><span>Enrolled</span><strong>{converted}</strong><small>Converted to learners</small></article><article className={rate >= 30 ? "good" : ""}><span>Conversion</span><strong>{rate}%</strong><small>Enquiry → enrolment</small></article></section>

      <section className="enquiry-pipeline"><div className="pipeline-head"><div><span className="eyebrow">Pipeline</span><h3>Where every enquiry stands</h3></div><Link href="/school/reports/analytics">View analytics →</Link></div><div className="pipeline-grid">{STAGES.map(([stage, name]) => <Link href={`/school/admissions/enquiries?view=${stage}`} className={`pipeline-stage ${view===stage ? "active" : ""}`} key={stage}><span>{name}</span><strong>{counts[stage] ?? 0}</strong><small>{stage === "new" ? "Just arrived" : stage === "contacted" ? "First response" : stage === "interested" ? "Qualified interest" : stage === "visit" ? "Visit or interview" : stage === "applied" ? "Application started" : "Successful"}</small></Link>)}</div></section>

      <section className="enquiry-main-grid">
        <div className="enquiry-board">
          <div className="board-head"><div><span className="eyebrow">Enquiry register</span><h3>{q ? `Results for “${q}”` : "Prospective families"}</h3><p>{total} records in this view.</p></div><div className="view-links">{[["all","All"],...STAGES.map(([s,n])=>[s,n] as const)].map(([key,name])=><Link key={key} href={key==="all" ? "/school/admissions/enquiries" : `/school/admissions/enquiries?view=${key}`} className={view===key?"selected":""}>{name}</Link>)}</div></div>
          <form className="enquiry-search"><span>⌕</span><input name="q" defaultValue={q} placeholder="Search student, guardian, phone or enquiry number"/><button className="button secondary" type="submit">Search</button></form>
          {data.enquiries.length ? <div className="enquiry-list">{data.enquiries.map((e) => <article className="enquiry-row" key={e.id}><div className="enquiry-identity"><span className="enquiry-avatar">{e.studentName.slice(0,2).toUpperCase()}</span><div><div className="enquiry-ref">{e.reference}</div><h4>{e.studentName}</h4><p>{e.guardianName ?? "Guardian not recorded"}{e.phone ? ` · ${e.phone}` : ""}</p></div></div><div className="enquiry-meta"><span className="stage-pill stage-{e.stage}">{label(e.stage)}</span><strong>{e.intendedClass ?? "Class not chosen"}</strong><small>{label(e.source)}</small></div><div className="enquiry-next">{e.nextFollowUpAt ? <><span>Next follow-up</span><strong>{new Date(e.nextFollowUpAt).toLocaleDateString()} {new Date(e.nextFollowUpAt).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</strong></> : <><span>Next follow-up</span><strong>Not scheduled</strong></>}<small>{e.notes ?? "No note"}</small></div><div className="enquiry-actions"><form action={updateEnquiry}><input type="hidden" name="id" value={e.id}/><select name="stage" defaultValue={e.stage}>{STAGES.map(([k,n])=><option value={k} key={k}>{n}</option>)}</select><input type="datetime-local" name="nextFollowUpAt" defaultValue={e.nextFollowUpAt ? new Date(e.nextFollowUpAt).toISOString().slice(0,16) : ""}/><button className="button secondary" type="submit">Save</button></form>{e.stage === "applied" && !e.convertedStudentId ? <form action={convertEnquiry}><input type="hidden" name="id" value={e.id}/><button className="button primary" type="submit">Enrol student →</button></form> : null}<Link href={`/school/students/${e.convertedStudentId}`} className="text-action">{e.convertedStudentId ? "Open student →" : "Details →"}</Link></div></article>)}</div> : <div className="enquiry-empty"><div className="empty-mark">⌁</div><strong>{q ? "No enquiries matched your search" : "No enquiries recorded yet"}</strong><p>Start with the first parent call, walk-in, website lead or referral and keep the follow-up attached to the record.</p><a href="#new-enquiry" className="button primary">Create first enquiry</a></div>}
        </div>

        <aside className="followup-panel"><div className="panel-head"><div><span className="eyebrow">Follow-up desk</span><h3>Next conversations</h3></div><span>{followUps.length}</span></div>{followUps.length ? <div className="followup-list">{followUps.map((e)=><div className="followup-item" key={e.id}><div className="followup-date"><b>{new Date(e.nextFollowUpAt!).toLocaleDateString([], {month:"short",day:"numeric"})}</b><small>{new Date(e.nextFollowUpAt!).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small></div><div><strong>{e.studentName}</strong><small>{e.guardianName ?? "Guardian"} · {label(e.stage)}</small></div><Link href={`/school/admissions/enquiries?view=${e.stage}`}>→</Link></div>)}</div> : <div className="panel-empty">No follow-ups scheduled. Set the next contact date on an enquiry and it will appear here.</div>}
        </aside>
      </section>

      <section className="new-enquiry" id="new-enquiry"><div className="new-enquiry-copy"><span className="eyebrow">Capture a lead</span><h3>New enquiry</h3><p>Record the essentials once. The same enquiry can then move through the pipeline without retyping the family information.</p><div className="source-strip">{["walk_in","phone","website","referral"].map((source)=><span key={source}>{label(source)}</span>)}</div></div><form action={createEnquiry} className="enquiry-form"><div className="form-grid"><label>Prospective student<input required name="studentName" placeholder="Student name"/></label><label>Guardian name<input name="guardianName" placeholder="Parent or guardian"/></label><label>Phone / WhatsApp<input name="phone" placeholder="024 000 0000"/></label><label>Email<input name="email" type="email" placeholder="guardian@example.com"/></label><label>Applying for<input name="intendedClass" placeholder="e.g. Grade 4"/></label><label>Source<select name="source" defaultValue="walk_in">{SOURCES.map((s)=><option value={s} key={s}>{label(s)}</option>)}</select></label><label>Next follow-up<input name="nextFollowUpAt" type="datetime-local"/></label><label className="notes-field">Notes<textarea name="notes" rows={2} placeholder="What does the family need or what was discussed?"/></label></div><button className="button primary" type="submit">Save enquiry →</button></form></section>
    </div>
  </AppShell>;
}
