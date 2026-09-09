export type PermissionRisk = "standard" | "sensitive" | "critical";

export const PERMISSION_GROUP_LABELS: Record<string, string> = {
  lesson_plans: "Lesson planning",
  homework: "Homework & assignments",
  scores: "Marks & gradebook",
  report_cards: "Report cards",
  exams: "Exams & assessments",
  classes: "Classes & curriculum",
  attendance: "Attendance & pickup",
  analytics: "Analytics & intelligence",
  reports: "Reports",
  students: "Students",
  finance: "Finance",
  fees: "Fees",
  payroll: "Payroll",
  users: "Accounts",
  settings: "School settings",
  roles: "Roles & permissions",
  calendar: "Calendar",
  library: "Library & learning resources",
  transport: "Transport",
  feeding: "Canteen & feeding",
  assets: "Assets",
  recruitment: "Recruitment",
  risk_flags: "Student support & safeguarding",
  ai_drafts: "AI assistance",
  offline: "Offline sync",
  parents: "Family links",
  templates: "Templates",
  visitors: "Visitors",
  broadcast: "Emergency communications",
  guardian_alerts: "Guardian alerts",
  communications: "Communications",
  exports: "Exports",
  identity_cards: "Identity cards",
  support: "Support",
  invoices: "Invoices",
  payments: "Payments",
  academic_readiness: "Academic readiness",
};

const LABEL_OVERRIDES: Record<string, string> = {
  "students:read": "View students",
  "students:write": "Create & edit students",
  "students:delete": "Delete students",
  "finance:read": "View school finance",
  "finance:write": "Create & edit finance records",
  "finance:approve": "Approve financial actions",
  "payroll:view_own": "View own payroll",
  "payroll:manage": "Manage payroll",
  "settings:manage_roles": "Manage roles & permissions",
  "settings:manage_school": "Manage school settings",
  "reports:generate": "Generate reports",
  "users:read": "View accounts",
  "users:write": "Create & manage accounts",
  "audit:read": "View audit history",
  "calendar:manage": "Manage school calendar",
  "classes:manage": "Manage classes & curriculum",
  "attendance:record": "Record attendance",
  "attendance:record_all": "Record attendance for all students",
  "attendance:record_assigned": "Record assigned-class attendance",
  "attendance:record_staff": "Record staff attendance",
  "attendance:view_own": "View own attendance",
  "attendance:review": "Review & correct attendance",
  "attendance:display": "Open attendance display",
  "attendance:staff_scan": "Use staff attendance scan",
  "attendance:pickup_approve": "Approve student pickup",
  "scores:write:assigned": "Enter marks for assigned subjects",
  "scores:write:all": "Enter & edit all marks",
  "invoices:create": "Create student invoices",
  "payments:record": "Record payments",
  "payments:reverse": "Reverse payments",
  "report_cards:submit": "Submit report cards",
  "report_cards:approve": "Approve & publish report cards",
  "report_cards:view": "View report cards",
  "parents:read_linked": "View linked child information",
  "roles:create_custom": "Create custom role bundles",
  "visitors:log": "Manage visitor log",
  "templates:manage": "Manage school templates",
  "transport:manage": "Manage transport",
  "transport:view": "View transport",
  "feeding:manage": "Manage canteen & feeding",
  "exams:manage": "Manage exams & assessments",
  "exams:take": "Take assigned online assessments",
  "library:manage": "Manage library resources",
  "library:borrow": "Borrow/view learner library resources",
  "assets:manage": "Manage school assets",
  "fees:adjust": "Adjust fees",
  "fees:approve": "Approve fee changes",
  "recruitment:manage": "Manage recruitment",
  "analytics:view": "View analytics & intelligence",
  "offline:sync": "Use offline sync",
  "broadcast:emergency_send": "Send emergency broadcasts",
  "risk_flags:view": "View student risk/support signals",
  "ai_drafts:accept": "Use & accept AI-assisted drafts",
  "lesson_plans:manage": "Create & submit lesson plans",
  "lesson_plans:review": "Review lesson plans",
  "homework:manage_assigned": "Create homework for assigned classes",
  "homework:review": "Review homework workflows",
  "academic_readiness:view": "View academic readiness",
  "guardian_alerts:view": "View guardian alerts",
  "guardian_alerts:manage": "Manage guardian alerts",
  "communications:manage": "Manage school communications",
  "exports:students": "Export student data",
  "exports:staff": "Export staff data",
  "exports:attendance": "Export attendance data",
  "exports:finance": "Export finance data",
  "exports:gradebook": "Export gradebook data",
  "identity_cards:manage": "Manage identity cards",
  "support:create": "Create support cases",
  "support:view_own": "View own support cases",
  "support:manage": "Manage school support cases",
};

const CRITICAL = new Set([
  "students:delete",
  "finance:approve",
  "payroll:manage",
  "settings:manage_roles",
  "roles:create_custom",
  "payments:reverse",
  "broadcast:emergency_send",
]);

const SENSITIVE = new Set([
  "students:write",
  "finance:write",
  "settings:manage_school",
  "users:write",
  "audit:read",
  "attendance:review",
  "attendance:pickup_approve",
  "scores:write:all",
  "report_cards:approve",
  "fees:adjust",
  "fees:approve",
  "recruitment:manage",
  "risk_flags:view",
  "guardian_alerts:manage",
  "communications:manage",
  "exports:students",
  "exports:staff",
  "exports:attendance",
  "exports:finance",
  "exports:gradebook",
  "identity_cards:manage",
]);

export function permissionGroup(key: string) {
  const prefix = key.split(":")[0];
  return PERMISSION_GROUP_LABELS[prefix] ?? prefix.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function permissionLabel(key: string) {
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];
  return key
    .split(":")
    .map((part) => part.replaceAll("_", " "))
    .join(" · ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function permissionRisk(key: string): PermissionRisk {
  if (CRITICAL.has(key)) return "critical";
  if (SENSITIVE.has(key)) return "sensitive";
  return "standard";
}

export function permissionDescription(key: string) {
  const label = permissionLabel(key);
  const risk = permissionRisk(key);
  if (risk === "critical") return `${label}. High-impact permission: assign only to trusted leadership.`;
  if (risk === "sensitive") return `${label}. Sensitive operational permission.`;
  return `${label}.`;
}

export function permissionCatalogEntry(key: string) {
  return { key, label: permissionLabel(key), group: permissionGroup(key), risk: permissionRisk(key), description: permissionDescription(key) };
}
