export const PLATFORM_ROLE_PERMISSIONS:Record<string,Set<string>>={
  super_admin:new Set(["schools:manage","schools:impersonate","billing:manage","feature_flags:manage","analytics:cross_school","support:manage"]),
  platform_admin:new Set(["schools:manage","billing:manage","feature_flags:manage","analytics:cross_school","support:manage"]),
  support_admin:new Set(["schools:impersonate","support:manage"])
};
export function platformHasPermission(role:string,key:string){return Boolean(PLATFORM_ROLE_PERMISSIONS[role]?.has(key));}
export function groupReportAllowed(actorId:string,ownerId:string){return actorId===ownerId;}
export function aiDraftAffectsRealRecord(type:string,status:string){return status==="accepted"&&(type==="lesson_note"||type==="report_card_remark");}
export function emergencyRequiresConfirmation(action:string){return action!=="confirm";}
