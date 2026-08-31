export const DEFAULT_PERMISSIONS = [
  "students:read","students:write","students:delete","finance:read","finance:write","finance:approve","payroll:view_own","payroll:manage","settings:manage_roles","settings:manage_school","reports:generate","users:read","users:write","audit:read","calendar:manage","classes:manage","attendance:record","attendance:record_all","attendance:record_assigned","attendance:record_staff","attendance:view_own","attendance:review","attendance:pickup_approve","scores:write:assigned","scores:write:all","invoices:create","payments:record","payments:reverse","report_cards:submit","report_cards:approve","report_cards:view","parents:read_linked","roles:create_custom","visitors:log","templates:manage","transport:manage","transport:view","feeding:manage","exams:manage","exams:take","library:manage","library:borrow","assets:manage","fees:adjust","fees:approve","recruitment:manage","analytics:view","offline:sync","broadcast:emergency_send","risk_flags:view","ai_drafts:accept","lesson_plans:manage","lesson_plans:review","homework:manage_assigned","homework:review","academic_readiness:view","guardian_alerts:view","guardian_alerts:manage","exports:students","exports:staff","exports:attendance","exports:finance","exports:gradebook"
] as const;
export type PermissionKey=(typeof DEFAULT_PERMISSIONS)[number];
const LEADERSHIP_PERMISSIONS:readonly PermissionKey[]=[
  "students:read","finance:read","payroll:view_own","settings:manage_school","reports:generate","users:read","audit:read",
  "calendar:manage","classes:manage","attendance:record","attendance:record_all","attendance:record_staff","attendance:review","scores:write:all","report_cards:submit","report_cards:approve","report_cards:view",
  "exams:manage","library:manage","transport:view","feeding:manage","analytics:view","risk_flags:view","exports:students","exports:staff","exports:attendance","exports:finance","exports:gradebook",
  "lesson_plans:review","homework:review","academic_readiness:view","guardian_alerts:view","guardian_alerts:manage"
];
const ACADEMIC_COORDINATOR_PERMISSIONS:readonly PermissionKey[]=[
  "students:read","users:read","reports:generate","calendar:manage","classes:manage","attendance:record","attendance:record_all","attendance:review","scores:write:all","report_cards:submit",
  "report_cards:approve","report_cards:view","exams:manage","analytics:view","risk_flags:view","lesson_plans:review","homework:review","academic_readiness:view","guardian_alerts:view","guardian_alerts:manage"
];
const DEPARTMENT_HEAD_PERMISSIONS:readonly PermissionKey[]=[
  "students:read","reports:generate","attendance:record","attendance:record_all","attendance:review","scores:write:all","report_cards:submit","report_cards:view","exams:manage","analytics:view","risk_flags:view","lesson_plans:review","homework:review","academic_readiness:view","guardian_alerts:view"
];
const TEACHING_CORE=["lesson_plans:manage","homework:manage_assigned","scores:write:assigned","attendance:view_own","report_cards:view","exams:manage","exams:take","offline:sync","ai_drafts:accept"] as const;
export const DEFAULT_ROLE_PERMISSIONS:Record<string,readonly PermissionKey[]>= {
  Owner: DEFAULT_PERMISSIONS,
  Principal: [...LEADERSHIP_PERMISSIONS,"payments:reverse"],
  "Vice Principal": [...LEADERSHIP_PERMISSIONS,"payments:reverse"],
  "Academic Coordinator": ACADEMIC_COORDINATOR_PERMISSIONS,
  "Department Head": DEPARTMENT_HEAD_PERMISSIONS,
  Accountant: ["students:read","finance:read","finance:write","finance:approve","invoices:create","payments:record","payments:reverse","reports:generate","payroll:view_own","feeding:manage","fees:adjust","fees:approve","analytics:view","exports:students","exports:finance"],
  "HR Officer": ["students:read","attendance:record","attendance:record_staff","attendance:view_own","payroll:view_own","payroll:manage","users:read","users:write","reports:generate","recruitment:manage","analytics:view","exports:staff","exports:attendance"],
  "Admissions Officer": ["students:read","students:write","reports:generate","payroll:view_own"],
  "Class Teacher": ["students:read","attendance:record","attendance:record_assigned","attendance:view_own",...TEACHING_CORE,"report_cards:submit","payroll:view_own","risk_flags:view"],
  "Subject Teacher": ["students:read",...TEACHING_CORE,"payroll:view_own"],
  "Front Desk/Gate Security": ["students:read","attendance:record","attendance:record_all","attendance:view_own","attendance:pickup_approve","visitors:log","payroll:view_own"],
  "Transport Officer": ["students:read","payroll:view_own","transport:manage","transport:view","offline:sync"],
  Parent: ["parents:read_linked","report_cards:view","transport:view","exams:take","library:borrow"],
  Student: []
};
export const DEFAULT_ROLE_NAMES=Object.keys(DEFAULT_ROLE_PERMISSIONS);