import { describe, expect, it, vi } from "vitest";
import { withTenant } from "../src/lib/db";
import { createTenantFixture } from "./helpers";

const session = vi.hoisted(() => ({ schoolId: "", userId: "" }));
vi.mock("@/lib/school-auth", () => ({ requireSchoolSession: vi.fn(async () => session) }));
vi.mock("@/lib/auth", () => ({ requireSchoolSession: vi.fn(async () => session) }));

import { GET as getAcademicEngine, POST as postAcademicEngine } from "../src/app/api/school/academic-engine/route";
import { POST as postTimetable } from "../src/app/api/phase2/timetable/route";

async function grant(fixture: Awaited<ReturnType<typeof createTenantFixture>>, permission: string) {
  await withTenant(fixture.schoolId, async (tx) => {
    await tx.userPermissionOverride.create({
      data: {
        schoolId: fixture.schoolId,
        userId: fixture.memberId,
        permissionId: fixture.permissionIds.get(permission)!,
        granted: true,
      },
    });
  });
}

describe("timetable permission boundary", () => {
  it("lets a calendar manager load and save timetable setup without school-settings authority", async () => {
    const fixture = await createTenantFixture();
    session.schoolId = fixture.schoolId;
    session.userId = fixture.memberId;

    const deniedBeforeGrant = await getAcademicEngine();
    expect(deniedBeforeGrant.status).toBe(403);

    await grant(fixture, "calendar:manage");

    const response = await getAcademicEngine();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.timetable).toBeTruthy();

    const nextMinutes = body.timetable.periodMinutes === 45 ? 40 : 45;
    const save = await postAcademicEngine(new Request("http://localhost/api/school/academic-engine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        timetable: { ...body.timetable, periodMinutes: nextMinutes },
      }),
    }));
    expect(save.status).toBe(200);

    const persisted = await withTenant(fixture.schoolId, (tx) => tx.schoolSettings.findUnique({
      where: { schoolId: fixture.schoolId },
      select: { timetableConfig: true },
    }));
    expect((persisted?.timetableConfig as { periodMinutes?: number } | null)?.periodMinutes).toBe(nextMinutes);

    const protectedSave = await postAcademicEngine(new Request("http://localhost/api/school/academic-engine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", assessment: body.assessment }),
    }));
    expect(protectedSave.status).toBe(403);
  });

  it("does not let classes permission bypass the timetable-management boundary", async () => {
    const fixture = await createTenantFixture();
    await grant(fixture, "classes:manage");
    session.schoolId = fixture.schoolId;
    session.userId = fixture.memberId;

    const response = await postTimetable(new Request("http://localhost/api/phase2/timetable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "saveSlot",
        classId: "class-outside-calendar-scope",
        subjectId: "subject-outside-calendar-scope",
        teacherId: "teacher-outside-calendar-scope",
        dayOfWeek: 1,
        period: 1,
      }),
    }));

    expect(response.status).toBe(403);
  });
});
