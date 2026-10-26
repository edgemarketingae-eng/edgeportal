import { AuthUser, Batch, Course, Project, seedBaseData, StaffProfile } from "@edge/db";
import { createStaff } from "./staff/service";

/**
 * Idempotent seed. Production: roles, fee rates and the first super admin (SEED_ADMIN_EMAIL /
 * SEED_ADMIN_PASSWORD, must change password). Development also gets demo staff and a demo batch.
 */
export async function seed(opts: { production: boolean; adminEmail?: string; adminPassword?: string }) {
  await seedBaseData();
  const prod = opts.production;
  const adminEmail = opts.adminEmail ?? (prod ? undefined : "admin@edgeacademy.local");
  const adminPassword = opts.adminPassword ?? (prod ? undefined : "ChangeMe!2026");
  if (adminEmail && adminPassword) {
    if (prod && adminPassword.length < 12) throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters in production");
    if (!(await AuthUser.exists({ email: adminEmail }))) {
      await createStaff({ name: "Super Admin", email: adminEmail, roleKeys: ["super_admin"], password: adminPassword }, { type: "SYSTEM", id: "seed" });
      if (prod) await AuthUser.updateOne({ email: adminEmail }, { $set: { mustChangePassword: true } });
    }
  } else if (!(await StaffProfile.exists({}))) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create the first super admin");
  }
  if (prod) return;

  const demo = [
    { email: "mentor@edgeacademy.local", name: "Demo Mentor", roleKeys: ["mentor"], title: "Senior Mentor", workspaceEmail: "mentor@edgeacademy.ae" },
    { email: "admissions@edgeacademy.local", name: "Admissions Desk", roleKeys: ["admissions"] },
    { email: "finance@edgeacademy.local", name: "Finance Desk", roleKeys: ["finance"] },
    { email: "crm-admin@edgeacademy.local", name: "CRM Admin", roleKeys: ["crm_admin"] },
    { email: "pm@edgeacademy.local", name: "Demo Project Manager", roleKeys: ["project_manager"] },
    { email: "sales@edgeacademy.local", name: "Sales Desk", roleKeys: ["sales_executive"], phone: "+971500000001" },
  ];
  for (const d of demo) {
    if (!(await AuthUser.exists({ email: d.email }))) await createStaff({ ...d, password: "ChangeMe!2026" }, { type: "SYSTEM", id: "seed" });
  }
  const course = await Course.findOneAndUpdate(
    { code: "FX-PRO" },
    { $setOnInsert: { code: "FX-PRO", slug: "fx-pro", title: "Forex Pro Trader Program", description: "Price action, risk management and live market sessions." } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  const [pm, sales] = await Promise.all([AuthUser.findOne({ email: "pm@edgeacademy.local" }).lean(), AuthUser.findOne({ email: "sales@edgeacademy.local" }).lean()]);
  await Project.updateOne(
    { code: "FX-PRO-NOV26" },
    {
      $setOnInsert: {
        name: "Forex Pro - November 2026 drive",
        code: "FX-PRO-NOV26",
        description: "Fill the November batch.",
        status: "ACTIVE",
        courseId: course!._id,
        targetConversions: 40,
        managerIds: pm ? [pm._id] : [],
        memberIds: sales ? [sales._id] : [],
      },
    },
    { upsert: true },
  );
  const mentor = await AuthUser.findOne({ email: "mentor@edgeacademy.local" }).lean();
  await Batch.updateOne(
    { code: "FX-PRO-B1" },
    {
      $setOnInsert: {
        courseId: course!._id,
        code: "FX-PRO-B1",
        name: "Batch 1 - November 2026",
        startDate: new Date("2026-11-01T00:00:00Z"),
        endDate: new Date("2027-01-31T00:00:00Z"),
        scheduleText: "Mon / Wed / Fri, 8:00 - 9:30 PM (Dubai)",
        status: "OPEN",
        isCurrentForEnrollment: true,
        feeMinor: 500000,
        advancePresetsMinor: [20000, 30000, 50000],
        balanceDueRule: "DAYS_AFTER_FIRST_PAYMENT",
        balanceDueDays: 30,
        whatsappGroupUrl: "https://chat.whatsapp.com/example-batch-1",
        mentors: mentor ? [{ userId: mentor._id, isLead: true }] : [],
      },
    },
    { upsert: true },
  );
}
