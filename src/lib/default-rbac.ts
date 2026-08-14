export const DEFAULT_PERMISSIONS = [
  "students:read",
  "students:write",
  "students:delete",
  "finance:read",
  "finance:write",
  "finance:approve",
  "payroll:view_own",
  "payroll:manage",
  "settings:manage_roles",
  "settings:manage_school",
  "reports:generate",
  "users:read",
  "users:write",
  "audit:read"
] as const;

export type PermissionKey = (typeof DEFAULT_PERMISSIONS)[number];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  Owner: DEFAULT_PERMISSIONS,
  Principal: DEFAULT_PERMISSIONS,
  "Vice Principal": [
    "students:read",
    "students:write",
    "settings:manage_school",
    "reports:generate",
    "users:read"
  ],
  Accountant: [
    "finance:read",
    "finance:write",
    "finance:approve",
    "payroll:manage",
    "reports:generate"
  ],
  "HR Officer": [
    "students:read",
    "payroll:view_own",
    "payroll:manage",
    "users:read",
    "users:write",
    "reports:generate"
  ],
  "Admissions Officer": [
    "students:read",
    "students:write",
    "reports:generate"
  ],
  "Class Teacher": ["students:read", "reports:generate"],
  "Subject Teacher": ["students:read", "reports:generate"],
  "Front Desk/Gate Security": ["students:read"],
  "Transport Officer": ["students:read"],
  Parent: [],
  Student: []
};

export const DEFAULT_ROLE_NAMES = Object.keys(DEFAULT_ROLE_PERMISSIONS);
