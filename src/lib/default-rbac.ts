export const DEFAULT_PERMISSIONS = [
  "students:read","students:write","students:delete","finance:read","finance:write","finance:approve","payroll:view_own","payroll:manage","settings:manage_roles","settings:manage_school","reports:generate","users:read","users:write","audit:read","calendar:manage","classes:manage","attendance:record","attendance:view_own","attendance:pickup_approve","scores:write:assigned","scores:write:all","invoices:create","payments:record","report_cards:submit","report_cards:approve","report_cards:view","parents:read_linked","roles:create_custom","visitors:log","templates:manage","transport:manage","transport:view","feeding:manage","exams:manage","exams:take","library:manage","library:borrow","assets:manage","fees:adjust","fees:approve","recruitment:manage","analytics:view","offline:sync","broadcast:emergency_send","risk_flags:view","ai_drafts:accept"
] as const;
export type PermissionKey=(typeof DEFAULT_PERMISSIONS)[number];
const PRINCIPAL_PERMISSIONS=DEFAULT_PERMISSIONS.filter((key)=>key!=="roles:create_custom");
export const DEFAULT_ROLE_PERMISSIONS:Record<string,readonly PermissionKey[]>= {
  Owner: DEFAULT_PERMISSIONS,
  Principal: PRINCIPAL_PERMISSIONS,
  "Vice Principal": ["students:read","students:write","calendar:manage","classes:manage","attendance:record","attendance:view_own","attendance:pickup_approve","scores:write:all","report_cards:submit","report_cards:approve","report_cards:view","settings:manage_school","reports:generate","users:read","payroll:view_own","visitors:log","templates:manage","transport:manage","transport:view","feeding:manage","exams:manage","exams:take","library:manage","library:borrow","assets:manage","fees:adjust","offline:sync","analytics:view","risk_flags:view","ai_drafts:accept"],
  Accountant: ["students:read","finance:read","finance:write","finance:approve","invoices:create","payments:record","reports:generate","payroll:view_own","feeding:manage","fees:adjust","fees:approve","analytics:view"],
  "HR Officer": ["students:read","attendance:record","attendance:view_own","payroll:view_own","payroll:manage","users:read","users:write","reports:generate","recruitment:manage","analytics:view"],
  "Admissions Officer": ["students:read","students:write","reports:generate","payroll:view_own"],
  "Class Teacher": ["students:read","attendance:record","attendance:view_own","scores:write:assigned","report_cards:submit","report_cards:view","reports:generate","payroll:view_own","exams:manage","exams:take","library:manage","library:borrow","offline:sync","risk_flags:view","ai_drafts:accept"],
  "Subject Teacher": ["students:read","attendance:view_own","scores:write:assigned","report_cards:view","reports:generate","payroll:view_own","exams:manage","exams:take","library:manage","library:borrow","offline:sync","ai_drafts:accept"],
  "Front Desk/Gate Security": ["students:read","attendance:record","attendance:pickup_approve","visitors:log","payroll:view_own"],
  "Transport Officer": ["students:read","payroll:view_own","transport:manage","transport:view","offline:sync"],
  Parent: ["parents:read_linked","report_cards:view","transport:view","exams:take","library:borrow"],
  Student: []
};
export const DEFAULT_ROLE_NAMES=Object.keys(DEFAULT_ROLE_PERMISSIONS);
