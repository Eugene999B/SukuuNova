import Link from "next/link";
import { redirect } from "next/navigation";
import { createId } from "@paralleldrive/cuid2";
import { AppShell } from "@/components/AppShell";
import { requireSchoolSession } from "@/lib/school-auth";
import { withTenant } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { appendSchoolAudit } from "@/lib/audit";
import "./classes-houses.css";

const houseColors = ["#c45b45", "#2d8a69", "#b4771f", "#7356a8", "#2e7f88", "#b04c6e"];

async function createClass(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const level = String(formData.get("level") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const classTeacherId = String(formData.get("classTeacherId") ?? "").trim();
  if (!level || !name) throw new Error("Grade level and class group name are required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    if (classTeacherId) {
      const teacher = await tx.user.findFirst({ where: { id: classTeacherId, schoolId: session.schoolId }, select: { id: true } });
      if (!teacher) throw new Error("The selected class teacher does not belong to this school.");
    }
    const schoolClass = await tx.class.create({ data: { schoolId: session.schoolId, level, name, classTeacherId: classTeacherId || null } });
    await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "class.created", entityType: "Class", entityId: schoolClass.id, after: { level, name, classTeacherId: classTeacherId || null } });
  });
  redirect("/school/classes");
}

async function createHouse(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const color = String(formData.get("color") ?? houseColors[0]);
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name || !code) throw new Error("House name and code are required.");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "classes:manage");
    const duplicate = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "House" WHERE "schoolId"=${session.schoolId} AND ("name"=${name} OR "code"=${code}) LIMIT 1`;
    if (duplicate.length) throw new Error("A house with that name or code already exists.");
    const id = createId();
    await tx.$executeRaw`INSERT INTO "House" ("id","schoolId","name","code","color","description","isActive") VALUES (${id},${session.schoolId},${name},${code},${color},${description},true)`;
    await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "house.created", entityType: "House", entityId: id, after: { name, code, color, description } });
  });
  redirect("/school/classes?houses=1");
}

async function assignHouse(formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  const studentId = String(formData.get("studentId") ?? "");
  const houseId = String(formData.get("houseId") ?? "");
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    const house = await tx.$queryRaw<Array<{ id:string; name:string }>>`SELECT "id","name" FROM "House" WHERE "id"=${houseId} AND "schoolId"=${session.schoolId} AND "isActive"=true LIMIT 1`;
    const student = await tx.student.findFirst({ where: { id: studentId, schoolId: session.schoolId }, select: { id:true, name:true } });
    const previous = await tx.$queryRaw<Array<{ houseId:string|null }>>`SELECT "houseId" FROM "Student" WHERE "id"=${studentId} AND "schoolId"=${session.schoolId} LIMIT 1`;
    if (!house[0] || !student) throw new Error("Student or house not found.");
    await tx.$executeRaw`UPDATE "Student" SET "houseId"=${houseId} WHERE "id"=${studentId} AND "schoolId"=${session.schoolId}`;
    await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "student.house_assigned", entityType: "Student", entityId: studentId, before: { houseId: previous[0]?.houseId ?? null }, after: { houseId, houseName: house[0].name } });
  });
  redirect("/school/classes?houses=1");
}

async function autoBalanceHouses(_formData: FormData) {
  "use server";
  const session = await requireSchoolSession();
  await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:write");
    const houses = await tx.$queryRaw<Array<{id:string;name:string;studentCount:number}>>`SELECT h."id",h."name",COUNT(s."id")::int AS "studentCount" FROM "House" h LEFT JOIN "Student" s ON s."houseId"=h."id" AND s."schoolId"=h."schoolId" AND s."status"='active' WHERE h."schoolId"=${session.schoolId} AND h."isActive"=true GROUP BY h."id",h."name" ORDER BY COUNT(s."id") ASC,h."name" ASC`;
    if (!houses.length) throw new Error("Create at least one active house first.");
    const students = await tx.$queryRaw<Array<{id:string;houseId:string|null}>>`SELECT "id","houseId" FROM "Student" WHERE "schoolId"=${session.schoolId} AND "status"='active' ORDER BY "name" ASC`;
    const counts = new Map(houses.map((h) => [h.id, h.studentCount]));
    for (const student of students) {
      const sorted = [...houses].sort((a,b)=>(counts.get(a.id)!-counts.get(b.id)! ) || a.name.localeCompare(b.name));
      const target = sorted[0];
      if (student.houseId === target.id && counts.get(target.id)! <= (counts.get(sorted[sorted.length-1].id)!)) continue;
      await tx.$executeRaw`UPDATE "Student" SET "houseId"=${target.id} WHERE "id"=${student.id} AND "schoolId"=${session.schoolId}`;
      counts.set(target.id, counts.get(target.id)! + 1);
    }
    await appendSchoolAudit(tx, { schoolId: session.schoolId, actorId: session.userId, action: "houses.auto_balanced", entityType: "House", entityId: houses[0].id, after: { houseCount: houses.length, studentCount: students.length } });
  });
  redirect("/school/classes?houses=1");
}

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ class?: string; houses?: string; q?: string }> }) {
  const session = await requireSchoolSession();
  const params = await searchParams;
  const data = await withTenant(session.schoolId, async (tx) => {
    await requirePermission(tx, session.userId, "students:read");
    const [school, classes, teachers, houses, students] = await Promise.all([
      tx.school.findUnique({ where: { id: session.schoolId }, select: { name: true, uniqueCode: true } }),
      tx.class.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }], select: { id:true,name:true,level:true,classTeacher:{select:{id:true,name:true}},_count:{select:{students:true,subjectAssignments:true,timetableSlots:true}} } }),
      tx.user.findMany({ where: { schoolId: session.schoolId, status: "active" }, orderBy: { name: "asc" }, select: { id:true,name:true } }),
      tx.$queryRaw<Array<{id:string;name:string;code:string;color:string|null;description:string|null;isActive:boolean;studentCount:number}>>`SELECT h."id",h."name",h."code",h."color",h."description",h."isActive",COUNT(s."id")::int AS "studentCount" FROM "House" h LEFT JOIN "Student" s ON s."houseId"=h."id" AND s."schoolId"=h."schoolId" AND s."status"='active' WHERE h."schoolId"=${session.schoolId} GROUP BY h."id",h."name",h."code",h."color",h."description",h."isActive" ORDER BY h."name" ASC`,
      tx.$queryRaw<Array<{id:string;name:string;admissionNo:string;className:string|null;classLevel:string|null;houseId:string|null;houseName:string|null}>>`SELECT s."id",s."name",s."admissionNo",c."name" AS "className",c."level" AS "classLevel",h."id" AS "houseId",h."name" AS "houseName" FROM "Student" s LEFT JOIN "Class" c ON c."id"=s."classId" AND c."schoolId"=s."schoolId" LEFT JOIN "House" h ON h."id"=s."houseId" AND h."schoolId"=s."schoolId" WHERE s."schoolId"=${session.schoolId} AND s."status"='active' AND (${String(params.q ?? "").trim()}='' OR s."name" ILIKE ${`%${String(params.q ?? "").trim()}%`} OR s."admissionNo" ILIKE ${`%${String(params.q ?? "").trim()}%`}) ORDER BY s."name" ASC LIMIT 250`,
    ]);
    return { school, classes, teachers, houses, students };
  });

  const selected = data.classes.find((item) => item.id === params.class);
  const grouped = data.classes.reduce<Record<string, typeof data.classes>>((acc,item)=>{ const key=item.level?.trim()||"Unassigned grade"; (acc[key]??=[]).push(item); return acc; },{});
  const totalLearners = data.classes.reduce((sum,item)=>sum+item._count.students,0);
  const houseAssigned = data.students.filter((s)=>s.houseId).length;
  const unassigned = data.students.filter((s)=>!s.houseId).length;
  const showHouses = params.houses === "1";

  return <AppShell universe="school" title="Classes & Houses" subtitle="Shape the school's academic structure and manage the house community that connects learners across classes." active="Classes & Houses" schoolName={data.school?.name ?? "School Workspace"} schoolCode={data.school?.uniqueCode ?? ""} userName={session.name}>
    <div className="classes-houses-page">
      <section className="ch-hero">
        <div><div className="ch-eyebrow">School structure</div><h2>Build the structure once. Let the school run from it.</h2><p>Classes determine where teaching happens. Houses create the cross-class community. Both should be easy to set up, inspect and change without losing the learner history.</p></div>
        <div className="ch-actions"><Link href="/school/classes" className="ch-btn secondary">Class structure</Link><Link href="/school/classes?houses=1" className="ch-btn secondary">House system</Link><Link href="/school/classes?action=create" className="ch-btn primary">+ Create class</Link></div>
      </section>

      {!showHouses ? <>
        <div className="ch-overview"><section className="ch-panel"><div className="ch-panel-head"><div><div className="ch-eyebrow">Academic roster</div><h3>Grades and class groups</h3><p>A class is the day-to-day roster used by attendance, teaching, timetable and gradebook.</p></div><span className="ch-badge">{data.classes.length} groups</span></div><div className="grade-bands">{Object.entries(grouped).map(([level,sections])=><div className="grade-band" key={level}><div className="grade-band-top"><span className="grade-name">{level}</span><span className="grade-meta">{sections.reduce((s,c)=>s+c._count.students,0)} learners · {sections.length} groups</span></div><div className="class-grid">{sections.map((c)=><Link className={`class-tile ${selected?.id===c.id?"selected":""}`} href={`/school/classes?class=${c.id}`} key={c.id}><span className="class-mark">{c.name.slice(0,3).toUpperCase()}</span><span className="class-copy"><strong>{c.name}</strong><span>{c.classTeacher?.name ?? "Teacher not assigned"}</span></span><span className="class-count">{c._count.students}</span></Link>)}</div></div>)}</div></section><aside className="ch-panel"><div className="ch-panel-head"><div><div className="ch-eyebrow">House layer</div><h3>{data.houses.length} houses</h3><p>Every learner can belong to one house regardless of class.</p></div><span className="ch-badge">{houseAssigned}/{data.students.length} assigned</span></div><div className="house-list">{data.houses.slice(0,5).map((h)=><div className="house-card" key={h.id}><div className="house-top"><span className="house-dot" style={{"--house-color":h.color ?? "#c45b45"} as React.CSSProperties}/><strong>{h.name}</strong><span className="house-code">{h.code}</span></div><p className="house-desc">{h.description ?? "House community and activities."}</p><div className="house-meter"><span style={{width:`${Math.min(100,Math.round((h.studentCount/Math.max(1,data.students.length))*100))}%`,background:h.color ?? "#c45b45"}}/></div><div className="house-foot"><span>{h.studentCount} learners</span><Link href="/school/classes?houses=1">Manage →</Link></div></div>)}{data.houses.length===0?<div className="ch-callout"><strong>No houses configured</strong><span>Create your houses and SukuuNova can distribute learners across them automatically.</span><Link href="/school/classes?houses=1" className="ch-btn primary" style={{marginTop:10}}>Set up houses</Link></div>:null}</div></aside></div>
        <section className="ch-workbench"><div className="ch-panel"><div className="ch-panel-head"><div><div className="ch-eyebrow">Selected class</div><h3>{selected ? `${selected.level ? `${selected.level} · ` : ""}${selected.name}` : "Choose a class group"}</h3><p>{selected ? `${selected._count.students} learners · ${selected.classTeacher?.name ?? "No class teacher"}.` : "Open a class above to see its operational connections."}</p></div></div>{selected?<div className="ch-callout"><strong>Operational links</strong><span>Attendance, subjects, timetable, gradebook and class lists should all reference this same class group.</span><div className="ch-actions" style={{justifyContent:"flex-start",marginTop:10}}><Link href="/school/attendance" className="ch-btn secondary">Attendance</Link><Link href="/school/subjects" className="ch-btn secondary">Subjects</Link><Link href="/school/timetable" className="ch-btn secondary">Timetable</Link><Link href="/school/gradebook" className="ch-btn secondary">Gradebook</Link></div></div>:null}</div><div className="ch-panel"><div className="ch-panel-head"><div><div className="ch-eyebrow">Structure at a glance</div><h3>{Object.keys(grouped).length} grade levels</h3><p>{totalLearners} learners are currently assigned to class groups.</p></div></div><div className="house-list"><div className="ch-callout"><strong>{data.houses.length ? `${houseAssigned} learners have a house.` : "Houses are ready to be configured."}</strong><span>{unassigned ? `${unassigned} active learners still need a house.` : "Every active learner is assigned."}</span></div><Link href="/school/classes?houses=1" className="ch-btn primary">Open house system →</Link></div></div></section>
      </> : <>
        <div className="ch-overview"><section className="ch-panel"><div className="ch-panel-head"><div><div className="ch-eyebrow">House system</div><h3>Communities across the school</h3><p>Create houses once, then let balanced allocation place new learners into the smallest active house. Staff can override any assignment.</p></div><div className="ch-actions"><form action={autoBalanceHouses}><button className="ch-btn primary" type="submit">Balance houses</button></form><Link href="#new-house" className="ch-btn secondary">+ New house</Link></div></div><div className="house-list">{data.houses.map((h)=><div className="house-card" key={h.id}><div className="house-top"><span className="house-dot" style={{"--house-color":h.color ?? "#c45b45"} as React.CSSProperties}/><strong>{h.name}</strong><span className="house-code">{h.code}</span></div><p className="house-desc">{h.description ?? "No description"}</p><div className="house-meter"><span style={{width:`${Math.min(100,Math.round((h.studentCount/Math.max(1,data.students.length))*100))}%`,background:h.color ?? "#c45b45"}}/></div><div className="house-foot"><span><strong>{h.studentCount}</strong> active learners</span><span>{h.isActive?"Active":"Inactive"}</span></div></div>)}{data.houses.length===0?<div className="ch-callout"><strong>Start your house system</strong><span>Example: Akoto, Bosomtwe, Kente, Unity. Pick names that belong to the school.</span></div>:null}</div></section><aside className="ch-panel"><div className="ch-panel-head"><div><div className="ch-eyebrow">Create a house</div><h3>Keep setup simple</h3><p>The house name, short code and colour become the identity used throughout the school.</p></div></div><div className="ch-form" id="new-house"><form action={createHouse} className="ch-form-grid"><label>Name<input name="name" required placeholder="Example: Unity"/></label><label>Code<input name="code" required maxLength={8} placeholder="UNI"/></label><label>Colour<input name="color" type="color" defaultValue={houseColors[0]}/></label><label className="wide">Description<textarea name="description" rows={3} placeholder="Optional house identity or purpose"/></label><div className="wide ch-form-actions"><button className="ch-btn primary" type="submit">Create house</button></div></form></div></aside></div>
        <section className="ch-panel" style={{marginTop:18}}><div className="ch-panel-head"><div><div className="ch-eyebrow">House assignments</div><h3>Who belongs where?</h3><p>Use automatic balancing for the whole school, or change an individual learner here.</p></div><span className="ch-badge">{unassigned} unassigned</span></div><form className="ch-toolbar" method="get"><input name="q" defaultValue={params.q ?? ""} placeholder="Search learner or admission number"/><input type="hidden" name="houses" value="1"/><button className="ch-btn secondary" type="submit">Search</button></form><div className="ch-table-wrap"><table className="ch-table"><thead><tr><th>Learner</th><th>Class</th><th>House</th><th>Change</th></tr></thead><tbody>{data.students.map((s)=><tr key={s.id}><td><div className="ch-student"><span className="ch-avatar">{s.name.slice(0,2).toUpperCase()}</span><div><strong>{s.name}</strong><span>{s.admissionNo}</span></div></div></td><td>{s.className ?? "Not placed"}</td><td><span className={`ch-pill ${s.houseId?"assigned":"unassigned"}`}>{s.houseName ?? "Unassigned"}</span></td><td><form action={assignHouse} style={{display:"flex",gap:6,alignItems:"center"}}><input type="hidden" name="studentId" value={s.id}/><select name="houseId" defaultValue={s.houseId ?? ""}><option value="">Unassigned</option>{data.houses.filter(h=>h.isActive).map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select><button className="ch-btn secondary" type="submit">Save</button></form></td></tr>)}</tbody></table></div></section></>}

      {!showHouses && params.class === undefined && params.houses !== "1" ? <section className="ch-panel" style={{marginTop:18}}><div className="ch-panel-head"><div><div className="ch-eyebrow">Create a class group</div><h3>Add the next teaching roster</h3><p>Use a predictable pattern such as Grade 5 → 5A or JHS 2 → Blue.</p></div></div><div className="ch-form"><form action={createClass} className="ch-form-grid"><label>Grade level<input name="level" required placeholder="Grade 5"/></label><label>Class group<input name="name" required placeholder="5A"/></label><label className="wide">Class teacher<select name="classTeacherId" defaultValue=""><option value="">Not assigned yet</option>{data.teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><div className="wide ch-form-actions"><button className="ch-btn primary" type="submit">Create class group</button></div></form></div></section>:null}
    </div>
  </AppShell>;
}