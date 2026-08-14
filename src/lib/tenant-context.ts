import { AsyncLocalStorage } from "node:async_hooks";
import { TenantScopeError } from "./errors";

type TenantStore = {
  schoolId: string;
};

export const tenantContext = new AsyncLocalStorage<TenantStore>();

export function validateSchoolId(schoolId: string): string {
  const value = schoolId?.trim();
  if (!value) {
    throw new TenantScopeError("A verified school context is required.");
  }
  return value;
}

export function currentSchoolId(): string {
  const schoolId = tenantContext.getStore()?.schoolId;
  if (!schoolId) {
    throw new TenantScopeError("Tenant-scoped database access failed closed.");
  }
  return schoolId;
}
