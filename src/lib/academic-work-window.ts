import type { TenantDb } from "./db";
import { AppError } from "./errors";

export type AcademicWorkWindow = {
  opensAt: Date | null;
  dueAt: Date | null;
  status: string;
};

export function assertAcademicWorkWindowOpen(window: AcademicWorkWindow, now = new Date()) {
  if (window.status !== "published") {
    throw new AppError("This activity is not currently published.", 409, "WORK_NOT_PUBLISHED");
  }
  if (window.opensAt && now.getTime() < window.opensAt.getTime()) {
    throw new AppError(`This activity opens at ${window.opensAt.toISOString()}.`, 409, "WORK_NOT_OPEN");
  }
  if (window.dueAt && now.getTime() >= window.dueAt.getTime()) {
    throw new AppError("The submission window has closed.", 409, "WORK_EXPIRED");
  }
}

export async function requireAcademicWorkWindowOpen(tx: TenantDb, schoolId: string, workId: string, now = new Date()) {
  const rows = await tx.$queryRawUnsafe<AcademicWorkWindow[]>(
    `SELECT "opensAt","dueAt","status" FROM "TeacherAcademicWork" WHERE "schoolId"=$1 AND "id"=$2 LIMIT 1`,
    schoolId,
    workId,
  );
  const window = rows[0];
  if (!window) throw new AppError("Academic work was not found.", 404, "NOT_FOUND");
  assertAcademicWorkWindowOpen(window, now);
  return window;
}
