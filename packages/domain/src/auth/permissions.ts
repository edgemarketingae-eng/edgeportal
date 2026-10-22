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
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(p: string): p is Permission {
  return p in PERMISSIONS;
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
];
