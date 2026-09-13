import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const createDialog = readFileSync(new URL("../src/app/school/staff/StaffCreateDialog.tsx", import.meta.url), "utf8");
const staffActions = readFileSync(new URL("../src/app/school/staff/actions.ts", import.meta.url), "utf8");
const staffDirectoryPage = readFileSync(new URL("../src/app/school/staff/page.tsx", import.meta.url), "utf8");
const staffProfilePage = readFileSync(new URL("../src/app/school/staff/[id]/page.tsx", import.meta.url), "utf8");
const teachingManagement = readFileSync(new URL("../src/components/staff/StaffTeachingManagement.tsx", import.meta.url), "utf8");
const accessRoute = readFileSync(new URL("../src/app/api/school/access/route.ts", import.meta.url), "utf8");

describe("teacher multi-class and multi-subject management", () => {
  it("builds teacher creation around class rows with multiple offered subjects", () => {
    expect(createDialog).toContain("teachingAssignments");
    expect(createDialog).toContain("＋ Add another class");
    expect(createDialog).toContain("schoolClass.subjects.map");
    expect(createDialog).toContain("Use each class once and select all subjects for that class together.");
    expect(createDialog).toContain("JSON.stringify(selectedAssignments.map(({ classId, subjectIds })");
  });

  it("loads class-subject offerings instead of exposing the global subject catalogue for teaching scope", () => {
    expect(staffDirectoryPage).toContain('FROM "ClassSubjectOffering"');
    expect(staffDirectoryPage).toContain("subjects: offeringRows");
    expect(staffDirectoryPage).toContain("classId === schoolClass.id");
    expect(staffProfilePage).toContain('FROM "ClassSubjectOffering"');
    expect(staffProfilePage).toContain("subjects: offeringRows");
    expect(staffProfilePage).toContain("classId === schoolClass.id");
  });

  it("validates every assignment pair against the authoritative class offering before writing", () => {
    expect(staffActions).toContain("async function validateTeachingPairs");
    expect(staffActions).toContain('FROM "ClassSubjectOffering" o');
    expect(staffActions).toContain("One of the selected subjects is not configured for that class");
    expect(staffActions).toContain("await validateTeachingPairs(tx, session.schoolId, teachingAssignments)");
    expect(staffActions).toContain("classSubjectTeacher.createMany");
  });

  it("supports audited replacement of a teacher's saved class-subject scope", () => {
    expect(staffActions).toContain("export async function updateStaffTeachingAssignments");
    expect(staffActions).toContain("staff-teaching:${session.schoolId}:${target.id}");
    expect(staffActions).toContain("classSubjectTeacher.deleteMany");
    expect(staffActions).toContain('action: "staff.teaching_assignments_updated"');
    expect(staffActions).toContain("Give this staff member a teaching role before assigning classes and subjects.");
  });

  it("makes teaching scope editable from the staff profile without recreating the identity", () => {
    expect(staffProfilePage).toContain("<StaffTeachingManagement");
    expect(teachingManagement).toContain("Save teaching assignments");
    expect(teachingManagement).toContain("Save roles");
    expect(teachingManagement).toContain("initialAssignments.length > 0 || rows.some");
    expect(teachingManagement).toContain("Save the removal of teaching assignments first");
  });

  it("keeps role writes on the existing hardened access path", () => {
    expect(teachingManagement).toContain('fetch("/api/school/access"');
    expect(teachingManagement).toContain('method: "PATCH"');
    expect(accessRoute).toContain("requireCanAssignRoles");
    expect(accessRoute).toContain("requireOwnerContinuity");
    expect(accessRoute).toContain("requireCanGrantPermissions");
    expect(accessRoute).toContain("canControlRoles");
  });
});
