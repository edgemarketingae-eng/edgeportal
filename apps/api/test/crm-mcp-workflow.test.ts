import { CrmProduct, LeadDeposit, Project } from "@edge/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { closeTestDb, resetDb, startApi } from "./helpers";
import { callTool, claudeAccess, connect, staff } from "./mcp-helpers";

type Api = Awaited<ReturnType<typeof startApi>>;
let auth: Api["auth"];
let app: Api["app"];
beforeAll(async () => {
  ({ auth } = await startApi());
});
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  await claudeAccess(true);
  app = createApp({ auth, logger: false });
});

/** Calls a tool and fails the test with Claude's error text if it errors. */
async function ok(token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await callTool(app, token, name, args);
  if (r.isError) throw new Error(`${name}: ${r.text}`);
  return r.data;
}

describe("Claude connector: a day's work through the tools", () => {
  it("runs leads, tasks, projects, deposits, products and settings end to end", async () => {
    const admin = await staff("crm_admin");
    const exec = await staff("sales_executive");
    const t = (await connect(app, admin.email)).accessToken;
    const general = String((await Project.findOne({ isDefault: true }).lean())!._id);

    // Projects
    const { projectId } = await ok(t, "create_project", {
      name: "Malayalam team",
      code: "MAL",
      managerIds: [admin.id],
      memberIds: [exec.id],
    });
    await ok(t, "update_project", { projectId, description: "Kerala leads", targetLeads: 100 });
    await ok(t, "update_project", { projectId, description: null, targetLeads: null });
    await ok(t, "add_project_member", { projectId, userId: exec.id, role: "member" });
    expect((await ok(t, "list_projects")).map((p: { code: string }) => p.code)).toContain("MAL");
    expect((await ok(t, "get_project", { projectId })).project.description).toBeNull();

    // Leads
    const { leadId } = await ok(t, "create_lead", {
      projectId,
      name: "Anil Kumar",
      phone: "+971502223344",
      source: "INSTAGRAM",
      language: "MALAYALAM",
      qualification: { purpose: "Second income" },
      nextFollowUpAt: "2030-01-05T10:30",
    });
    await ok(t, "update_lead", { leadId, email: "anil@example.com", tags: ["hot-lead"], temperature: "HOT", notes: "Prefers evenings" });
    await ok(t, "update_lead", { leadId, notes: null, qualification: { purpose: null } });
    const found = await ok(t, "search_leads", { query: "anil", projectId });
    expect(found.total).toBe(1);
    expect(found.leads[0]).toMatchObject({ id: leadId, temperature: "HOT", tags: ["hot-lead"] });
    await ok(t, "assign_lead", { leadId, ownerId: exec.id });
    await ok(t, "assign_lead", { leadId, ownerId: null });
    await ok(t, "claim_lead", { leadId });
    await ok(t, "log_activity", {
      leadId,
      type: "CALL",
      direction: "OUT",
      outcome: "ANSWERED",
      body: "Interested",
      nextFollowUpAt: "2030-01-06T09:00",
    });
    await ok(t, "set_lead_stage", { leadId, stage: "QUALIFIED", note: "Has a budget" });
    const lead = await ok(t, "get_lead", { leadId });
    expect(lead.lead).toMatchObject({ stage: "QUALIFIED", email: "anil@example.com", notes: null });
    expect(lead.lead.nextFollowUpAt).toMatch(/^2030-01-05T10:30$/); // Dubai local time out, as it went in
    expect(lead.openTasks.length).toBeGreaterThan(0);
    await ok(t, "move_lead_to_project", { leadId, projectId: general });

    // Tasks
    const { taskId } = await ok(t, "create_task", { leadId, title: "Send the brochure", priority: "HIGH", dueAt: "2030-01-07T12:00" });
    await ok(t, "update_task", { taskId, description: "PDF on WhatsApp", assigneeId: admin.id });
    await ok(t, "move_task", { taskId, status: "IN_PROGRESS" });
    await ok(t, "comment_on_task", { taskId, body: "Sent the PDF" });
    await ok(t, "reschedule_task", { taskId, dueAt: "2030-01-08T12:00" });
    const task = await ok(t, "get_task", { taskId });
    expect(task.task).toMatchObject({ status: "IN_PROGRESS", dueAt: "2030-01-08T12:00", priority: "HIGH" });
    expect(task.comments[0].body).toBe("Sent the PDF");
    await ok(t, "complete_task", { taskId, note: "Done", outcome: "ANSWERED" });
    expect((await ok(t, "list_tasks", { scope: "all", status: "done" })).tasks.map((x: { id: string }) => x.id)).toContain(taskId);
    const { taskId: other } = await ok(t, "create_task", { projectId, title: "Plan the webinar" });
    await ok(t, "cancel_task", { taskId: other });

    // Products and conversions
    const { productId } = await ok(t, "create_product", { name: "Inner Circle", projectIds: [projectId] });
    await ok(t, "update_product", { productId, description: "Monthly mentorship" });
    expect((await ok(t, "list_products")).map((p: { id: string }) => p.id)).toContain(productId);
    await ok(t, "mark_conversions", { leadId, productIds: [productId], note: "Paid by card" });
    const afterConv = await ok(t, "get_lead", { leadId });
    expect(afterConv.lead.stage).toBe("CONVERTED");
    await ok(t, "remove_conversion", { conversionId: afterConv.conversions[0].id });

    // Deposits and commission
    await ok(t, "set_commission_rates", {
      firstPct: 10,
      slabs: [
        { fromUsd: 0, pct: 5 },
        { fromUsd: 5000, pct: 7 },
      ],
    });
    expect(await ok(t, "get_commission_rates")).toMatchObject({
      firstPct: 10,
      slabs: [
        { from: 0, pct: 5 },
        { from: 5000, pct: 7 },
      ],
    });
    const { depositId } = await ok(t, "log_deposit", {
      leadId,
      sequence: "FIRST",
      amountUsd: 1250.5,
      depositedOn: "2026-11-01",
      jetaFxClientId: "JFX123",
    });
    const pending = await ok(t, "list_deposits", { status: "PENDING" });
    expect(pending.deposits[0]).toMatchObject({ id: depositId, amountUsd: 1250.5, status: "PENDING" });
    await ok(t, "verify_deposit", { depositId });
    expect((await LeadDeposit.findById(depositId).lean())!.status).toBe("VERIFIED");
    const { depositId: second } = await ok(t, "log_deposit", { leadId, sequence: "LATER", amountUsd: "300", depositedOn: "2026-11-02" });
    await ok(t, "reject_deposit", { depositId: second, reason: "Not in the broker report" });
    const { depositId: third } = await ok(t, "log_deposit", { leadId, sequence: "LATER", amountUsd: "50", depositedOn: "2026-11-03" });
    await ok(t, "delete_deposit", { depositId: third });
    await ok(t, "get_staff_commission", { staffId: admin.id });

    // Reports
    expect(await ok(t, "get_dashboard")).toHaveProperty("openLeads");
    expect(await ok(t, "get_leaderboard", { period: "month" })).toHaveProperty("rows");
    expect(await ok(t, "get_call_report", { period: "week" })).toHaveProperty("totals");
    const me = await ok(t, "whoami");
    expect(me.projects.find((p: { id: string }) => p.id === projectId).team.map((m: { id: string }) => m.id)).toContain(exec.id);
    expect(me.products.map((p: { id: string }) => p.id)).toContain(productId);

    // Settings
    await ok(t, "update_pipeline_rules", { followUpSlaHours: 12, lostReasons: ["Budget", "No reply"] });
    expect(await ok(t, "get_crm_settings")).toMatchObject({ followUpSlaHours: 12, staleAfterDays: 7, lostReasons: ["Budget", "No reply"] });

    // Bulk, merge and deletes
    const { leadId: dupe } = await ok(t, "create_lead", {
      projectId: general,
      name: "Anil K",
      email: "anil.k@example.com",
      source: "WEBSITE",
    });
    await ok(t, "merge_leads", { keepLeadId: leadId, mergeLeadId: dupe });
    const ids: string[] = [];
    for (const n of [1, 2, 3])
      ids.push((await ok(t, "create_lead", { projectId, name: `Bulk ${n}`, phone: `+97150900000${n}`, source: "IMPORT" })).leadId);
    expect((await ok(t, "bulk_assign_leads", { filters: { projectId, query: "bulk" }, ownerId: exec.id })).updated).toBe(3);
    expect((await ok(t, "bulk_delete_leads", { leadIds: ids.slice(0, 2) })).deleted).toBe(2);
    await ok(t, "delete_lead", { leadId: ids[2] });
    await ok(t, "set_lead_stage", { leadId, stage: "LOST", lostReason: "Budget" });
    await ok(t, "remove_project_member", { projectId, userId: exec.id });
    expect(await CrmProduct.countDocuments({ _id: productId })).toBe(1);
  });

  it("keeps what a partial update leaves out (a paused project stays paused, a product stays archived)", async () => {
    const admin = await staff("crm_admin");
    const pm = await staff("project_manager");
    const project = await Project.create({ name: "Paused team", code: "PAUSED", status: "PAUSED", managerIds: [pm.id] });
    const pmToken = (await connect(app, pm.email)).accessToken;
    await ok(pmToken, "update_project", { projectId: String(project._id), description: "Back in January" });
    expect((await Project.findById(project._id).lean())!.status).toBe("PAUSED");

    const t = (await connect(app, admin.email)).accessToken;
    const { productId } = await ok(t, "create_product", { name: "Old course", status: "ARCHIVED" });
    await ok(t, "update_product", { productId, description: "Kept for history" });
    expect((await CrmProduct.findById(productId).lean())!.status).toBe("ARCHIVED");
  });

  it("tells Claude what to fix when the input is wrong", async () => {
    const exec = await staff("sales_executive");
    const t = (await connect(app, exec.email)).accessToken;
    const general = String((await Project.findOne({ isDefault: true }).lean())!._id);
    const noContact = await callTool(app, t, "create_lead", { projectId: general, name: "No contact", source: "WEBSITE" });
    expect(noContact.isError).toBe(true);
    expect(noContact.text).toContain("phone");
    const badTime = await callTool(app, t, "create_task", { projectId: general, title: "Call back", dueAt: "tomorrow 5pm" });
    expect(badTime.isError).toBe(true);
    expect(badTime.text).toContain("YYYY-MM-DDTHH:mm");
  });
});
