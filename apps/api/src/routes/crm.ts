import { crmRoutes } from "@edge/contracts";
import { LEAD_STAGE_LABELS } from "@edge/domain/crm/labels";
import type { Permission } from "@edge/domain/auth/permissions";
import {
  addActivity,
  addTaskComment,
  assignLead,
  bulkAssignLeads,
  cancelTask,
  claimLead,
  completeTask,
  convertLeadToStudent,
  createCrmStaff,
  createLead,
  createProject,
  createTask,
  dueTaskCount,
  getBoard,
  getCrmDashboard,
  getCrmOptions,
  getCrmSettings,
  getCrmStaff,
  getLeadDetail,
  getProject,
  getTaskDetail,
  handleLeadWebhook,
  importLeads,
  leadsCsv,
  linkLeadToStudent,
  listCrmRoles,
  listCrmStaff,
  listLeads,
  listProjects,
  listTasks,
  loadCrmScope,
  mergeLeads,
  moveLeadToProject,
  moveTask,
  previewImport,
  removeProjectMember,
  resendWelcome,
  resetCrmStaffPassword,
  rescheduleTask,
  saveCrmRole,
  saveCrmSettings,
  setCrmStaffDisabled,
  setProjectMember,
  setStage,
  updateCrmStaff,
  updateLead,
  updateProject,
  updateTask,
} from "@edge/services";
import { fromNodeHeaders } from "better-auth/node";
import express, { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { clientIp } from "../http/context";
import { actorOf, requirePermission } from "../http/guards";
import { register } from "../http/route";

/** Every CRM route needs crm.access plus the named permissions; the project scope is loaded once per request. */
async function crm(req: Request, ...perms: Permission[]) {
  const v = requirePermission(req, "crm.access", ...perms);
  req.crmScope ??= await loadCrmScope(v);
  return { v, actor: actorOf(v), scope: req.crmScope };
}

const ok = (message: string) => ({ ok: true as const, message });

/** Internal (Next.js server) CRM routes. Visibility and assignment rules live in the services via the scope. */
export function crmRouter() {
  const r = Router();

  register(r, crmRoutes.dashboard, async (req) => getCrmDashboard((await crm(req, "crm.read")).scope, req.valid.query));
  register(r, crmRoutes.options, async (req) => getCrmOptions((await crm(req, "crm.read")).scope));
  register(r, crmRoutes.dueCount, async (req) => ({ count: await dueTaskCount((await crm(req, "crm.read")).scope) }));

  // Leads
  register(r, crmRoutes.leads, async (req) => listLeads(req.valid.query, (await crm(req, "crm.read")).scope));
  register(r, crmRoutes.leadsCsv, async (req, res) => {
    const { scope } = await crm(req, "crm.read");
    const csv = await leadsCsv(req.valid.query, scope);
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${csv}`); // BOM so Excel opens UTF-8 correctly
  });
  register(r, crmRoutes.create, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    return { id: await createLead(req.valid.body, actor, scope) };
  });
  register(r, crmRoutes.bulkAssign, async (req) => {
    const { actor, scope } = await crm(req, "crm.assign");
    const updated = await bulkAssignLeads(req.valid.body.ids, req.valid.body.ownerId || null, actor, scope);
    return { ok: true as const, updated, message: `${updated} lead${updated === 1 ? "" : "s"} ${req.valid.body.ownerId ? "assigned" : "unassigned"}.` };
  });
  register(r, crmRoutes.lead, async (req) => getLeadDetail(req.valid.params.id, (await crm(req, "crm.read")).scope));
  register(r, crmRoutes.update, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await updateLead(req.valid.params.id, req.valid.body, actor, scope);
    return ok("Lead saved.");
  });
  register(r, crmRoutes.stage, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await setStage(req.valid.params.id, req.valid.body, actor, scope);
    return ok(`Moved to ${LEAD_STAGE_LABELS[req.valid.body.stage]}.`);
  });
  register(r, crmRoutes.assign, async (req) => {
    const { actor, scope } = await crm(req, "crm.assign");
    const ownerId = req.valid.body.ownerId || null;
    await assignLead(req.valid.params.id, ownerId, actor, scope);
    return ok(ownerId ? "Lead assigned." : "Lead unassigned.");
  });
  register(r, crmRoutes.claim, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await claimLead(req.valid.params.id, actor, scope);
    return ok("Lead is yours.");
  });
  register(r, crmRoutes.moveProject, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await moveLeadToProject(req.valid.params.id, req.valid.body.projectId, actor, scope);
    return ok("Lead moved.");
  });
  register(r, crmRoutes.activity, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await addActivity(req.valid.params.id, req.valid.body, actor, scope);
    return ok(req.valid.body.nextFollowUpAt ? "Logged and follow-up scheduled." : "Logged.");
  });
  register(r, crmRoutes.convert, async (req) => {
    const { actor, scope } = await crm(req, "crm.convert");
    const b = req.valid.body;
    const out = await convertLeadToStudent(req.valid.params.id, { batchId: b.batchId || undefined, sendSetPassword: b.sendSetPassword, actor, scope });
    return { ok: true as const, studentId: out.studentId, message: b.sendSetPassword ? "Student account created. A set-password email is on its way." : "Student account created (no email sent)." };
  });
  register(r, crmRoutes.link, async (req) => {
    const { actor, scope } = await crm(req, "crm.convert");
    await linkLeadToStudent(req.valid.params.id, req.valid.body.studentId, actor, scope);
    return ok("Linked to the student account.");
  });
  register(r, crmRoutes.resendWelcome, async (req) => {
    const { actor, scope } = await crm(req, "crm.convert");
    await resendWelcome(req.valid.params.id, actor, scope);
    return ok("Set-password email sent.");
  });
  register(r, crmRoutes.merge, async (req) => {
    const { actor, scope } = await crm(req, "crm.manage");
    await mergeLeads(req.valid.params.id, req.valid.body.fromId, actor, scope);
    return ok("Leads merged.");
  });

  // Tasks and board
  register(r, crmRoutes.board, async (req) => getBoard((await crm(req, "crm.read")).scope, req.valid.query));
  register(r, crmRoutes.tasks, async (req) => listTasks((await crm(req, "crm.read")).scope, req.valid.query));
  register(r, crmRoutes.createTask, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    return { id: await createTask(req.valid.body, actor, scope) };
  });
  register(r, crmRoutes.task, async (req) => getTaskDetail(req.valid.params.id, (await crm(req, "crm.read")).scope));
  register(r, crmRoutes.updateTask, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await updateTask(req.valid.params.id, req.valid.body, actor, scope);
    return ok("Task saved.");
  });
  register(r, crmRoutes.moveTask, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await moveTask(req.valid.params.id, req.valid.body, actor, scope);
    return ok("Task moved.");
  });
  register(r, crmRoutes.completeTask, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await completeTask(req.valid.params.id, req.valid.body, actor, scope);
    return ok(req.valid.body.nextFollowUpAt ? "Done. Next follow-up scheduled." : "Task done.");
  });
  register(r, crmRoutes.cancelTask, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await cancelTask(req.valid.params.id, actor, scope);
    return ok("Task cancelled.");
  });
  register(r, crmRoutes.rescheduleTask, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await rescheduleTask(req.valid.params.id, req.valid.body.dueAt || undefined, actor, scope);
    return ok(req.valid.body.dueAt ? "Task rescheduled." : "Due date removed.");
  });
  register(r, crmRoutes.commentTask, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await addTaskComment(req.valid.params.id, req.valid.body.body, actor, scope);
    return ok("Comment added.");
  });

  // Projects
  register(r, crmRoutes.projects, async (req) => listProjects((await crm(req, "crm.read")).scope, req.valid.query));
  register(r, crmRoutes.createProject, async (req) => {
    const { actor, scope } = await crm(req, "crm.projects.manage");
    return { id: await createProject(req.valid.body, actor, scope) };
  });
  register(r, crmRoutes.project, async (req) => getProject(req.valid.params.id, (await crm(req, "crm.read")).scope));
  register(r, crmRoutes.updateProject, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await updateProject(req.valid.params.id, req.valid.body, actor, scope);
    return ok("Project saved.");
  });
  register(r, crmRoutes.projectMember, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await setProjectMember(req.valid.params.id, req.valid.body, actor, scope);
    return ok("Team updated.");
  });
  register(r, crmRoutes.removeProjectMember, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    await removeProjectMember(req.valid.params.id, req.valid.body.userId, actor, scope);
    return ok("Removed from the project.");
  });

  // Team (CRM staff and CRM roles)
  register(r, crmRoutes.team, async (req) => (await crm(req, "crm.staff.manage"), listCrmStaff()));
  register(r, crmRoutes.createStaff, async (req) => {
    const { actor } = await crm(req, "crm.staff.manage");
    const b = req.valid.body;
    return createCrmStaff({ ...b, workspaceEmail: b.workspaceEmail || undefined }, actor);
  });
  register(r, crmRoutes.staff, async (req) => (await crm(req, "crm.staff.manage"), getCrmStaff(req.valid.params.id)));
  register(r, crmRoutes.updateStaff, async (req) => {
    const { actor } = await crm(req, "crm.staff.manage");
    const b = req.valid.body;
    await updateCrmStaff(req.valid.params.id, { ...b, workspaceEmail: b.workspaceEmail || undefined }, actor);
    return ok("Saved.");
  });
  register(r, crmRoutes.setStaffDisabled, async (req) => {
    const { actor } = await crm(req, "crm.staff.manage");
    await setCrmStaffDisabled(req.valid.params.id, req.valid.body.disabled, actor);
    return ok(req.valid.body.disabled ? "Account disabled and signed out." : "Account enabled.");
  });
  register(r, crmRoutes.resetStaffPassword, async (req) => {
    const { actor } = await crm(req, "crm.staff.manage");
    return { ok: true as const, tempPassword: await resetCrmStaffPassword(req.valid.params.id, actor) };
  });
  register(r, crmRoutes.roles, async (req) => (await crm(req, "crm.staff.manage"), listCrmRoles()));
  register(r, crmRoutes.saveRole, async (req) => ({ id: await saveCrmRole(req.valid.body, (await crm(req, "crm.roles.manage")).actor) }));

  // Settings and import
  register(r, crmRoutes.settings, async (req) => (await crm(req, "crm.manage"), getCrmSettings()));
  register(r, crmRoutes.saveSettings, async (req) => {
    await saveCrmSettings(req.valid.body, (await crm(req, "crm.manage")).actor);
    return ok("CRM settings saved.");
  });
  register(r, crmRoutes.importPreview, async (req) => (await crm(req, "crm.manage"), previewImport(req.valid.body.csv)));
  register(r, crmRoutes.importCsv, async (req) => {
    const { actor, scope } = await crm(req, "crm.manage");
    const b = req.valid.body;
    const out = await importLeads(b.csv, { projectId: b.projectId, source: b.source, ownerId: b.ownerId || undefined }, actor, scope);
    return { ok: true as const, ...out, message: `${out.created} created, ${out.skipped} skipped, ${out.invalid} invalid.` };
  });

  return r;
}

/** Public lead intake (website forms): raw body, HMAC signature, rate limited. Mounted before express.json(). */
export function leadWebhookRouter() {
  const r = Router();
  const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Too many requests. Try again in a minute." } } });
  r.post("/api/webhooks/leads/:source", limiter, express.raw({ type: "*/*", limit: "256kb" }), async (req, res, next) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      const out = await handleLeadWebhook(String(req.params.source), raw, fromNodeHeaders(req.headers), clientIp(req));
      res.status(out.status).json(out.body);
    } catch (e) {
      next(e);
    }
  });
  return r;
}
