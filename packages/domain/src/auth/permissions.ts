/** Typed permission catalogue. Roles are stored in the DB as lists of these keys. */
export const PERMISSIONS = {
  "admin.access": "Open the admin panel",
  "staff.access": "Open the staff portal",
  "enrollment.read": "View enrollments",
  "enrollment.approve": "Approve or reject paid enrollments",
  "enrollment.lock": "Lock and unlock student access",
  "enrollment.editTerms": "Extend due dates and edit enrollment terms",
  "enrollment.assignBatch": "Assign or move students between batches",
  "student.read": "View student profiles",
  "student.update": "Edit student profiles",
  "payment.read": "View payments",
  "payment.recordManual": "Record bank transfer and cash payments",
  "odoo.retry": "Retry Odoo invoice sync",
  "catalog.manage": "Manage courses and batches",
  "class.schedule.own": "Schedule classes for own batches",
  "class.schedule.any": "Schedule classes for any batch",
  "recording.manage": "Add, publish and hide recordings",
  "settings.fees": "Edit gateway fee rates and tax settings",
  "settings.integrations": "Edit integration settings",
  "staff.manage": "Create and deactivate staff accounts",
  "roles.manage": "Edit roles and permissions",
  "audit.read": "View the audit log",
  "crm.access": "Open the CRM",
  "crm.read": "View leads, tasks and projects in scope",
  "crm.write": "Create and edit leads, log activities, work tasks and claim unassigned leads",
  "crm.assign": "Assign leads and tasks to others within scope",
  "crm.convert": "Convert leads into student accounts",
  "crm.all": "See every project and lead",
  "crm.projects.manage": "Create and edit projects and their teams",
  "crm.manage": "CRM settings, imports and merges",
  "crm.leads.delete": "Delete leads permanently",
  "crm.staff.manage": "Create and manage CRM staff",
  "crm.roles.manage": "Create and edit CRM roles",
  "crm.commission.manage": "Set commission rates, verify deposits and see everyone's commission",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(p: string): p is Permission {
  return p in PERMISSIONS;
}

/** CRM permissions are the `crm.*` keys; a CRM role grants nothing else, which is what lets CRM admins manage it. */
export function isCrmPermission(p: string) {
  return p.startsWith("crm.");
}
export const CRM_PERMISSIONS = ALL_PERMISSIONS.filter(isCrmPermission);

export function isCrmRole(role: { permissions?: readonly string[] | null }) {
  return !!role.permissions?.length && role.permissions.every(isCrmPermission);
}

/** System roles created by the seed. Admins can create more roles later. */
export const SYSTEM_ROLES: { key: string; name: string; description: string; permissions: Permission[] }[] = [
  { key: "super_admin", name: "Super admin", description: "Full access", permissions: ALL_PERMISSIONS },
  {
    key: "admin",
    name: "Admin",
    description: "Runs the academy day to day",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "roles.manage" && p !== "settings.integrations"),
  },
  {
    key: "admissions",
    name: "Admissions staff",
    description: "Verifies new students and their payments",
    permissions: [
      "admin.access",
      "enrollment.read",
      "enrollment.approve",
      "enrollment.lock",
      "enrollment.editTerms",
      "enrollment.assignBatch",
      "student.read",
      "student.update",
      "payment.read",
      "payment.recordManual",
    ],
  },
  {
    key: "finance",
    name: "Finance",
    description: "Payments, Odoo sync and fee settings",
    permissions: ["admin.access", "payment.read", "payment.recordManual", "odoo.retry", "enrollment.read", "student.read", "settings.fees"],
  },
  {
    key: "mentor",
    name: "Mentor",
    description: "Teaches batches and schedules live classes",
    permissions: ["staff.access", "class.schedule.own"],
  },
  // CRM roles hold only crm.* keys (see isCrmRole), so CRM admins may manage them inside the CRM.
  {
    key: "crm_admin",
    name: "CRM admin",
    description: "Everything in the CRM, including its staff and roles",
    permissions: CRM_PERMISSIONS,
  },
  {
    key: "crm_manager",
    name: "CRM manager",
    description: "Sees every project, creates projects and assigns teams",
    permissions: ["crm.access", "crm.read", "crm.write", "crm.assign", "crm.convert", "crm.all", "crm.projects.manage", "crm.manage"],
  },
  {
    key: "project_manager",
    name: "Project manager",
    description: "Runs the projects assigned to them: their leads, team and tasks",
    permissions: ["crm.access", "crm.read", "crm.write", "crm.assign", "crm.convert"],
  },
  {
    key: "sales_executive",
    name: "Sales executive",
    description: "Works their own leads and follow-ups",
    permissions: ["crm.access", "crm.read", "crm.write", "crm.convert"],
  },
];

/** System roles replaced by a newer key: the seed moves members over and deletes the old role. */
export const RETIRED_SYSTEM_ROLES: { key: string; replacedBy: string }[] = [{ key: "sales", replacedBy: "sales_executive" }];
