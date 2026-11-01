import { crmRoutes } from "@edge/contracts";
import { CrmDevice, CrmTask, NotificationLog, Project } from "@edge/db";
import type { PushMessage, PushSender } from "@edge/integrations/push/index";
import {
  allHandlers,
  assignLead,
  bulkAssignLeads,
  configureRuntime,
  createProject,
  createStaff,
  findDeviceByToken,
  getCallReport,
  loadCrmScope,
  loadViewer,
  registerDevice,
  removeDevice,
  rescheduleTask,
  runDueReminders,
  saveDeviceFcmToken,
} from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, producer, resetDb, startApi } from "./helpers";

class CapturePush implements PushSender {
  readonly provider = "capture";
  sent: PushMessage[] = [];
  tokenInvalid = false;
  async send(m: PushMessage) {
    this.sent.push(m);
    return { tokenInvalid: this.tokenInvalid };
  }
}

let app: Awaited<ReturnType<typeof startApi>>["app"];
const push = new CapturePush();
beforeAll(async () => {
  ({ app } = await startApi());
  configureRuntime({ push });
});
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  producer.take();
  push.sent = [];
  push.tokenInvalid = false;
});

let seq = 0;
async function person(role = "sales_executive", withPush = true) {
  seq += 1;
  const email = `${role}-${seq}@edge.test`;
  const { id } = await createStaff({ name: `${role} ${seq}`, email, roleKeys: [role], password: "StaffPass!2026" }, { type: "SYSTEM" });
  const token = await registerDevice(id, { appVersion: "0.1.0", model: "Test Phone" });
  if (withPush) await saveDeviceFcmToken((await findDeviceByToken(token))!._id, `fcm-${id}`);
  return { id, token, actor: { type: "USER" as const, id } };
}
type Person = Awaited<ReturnType<typeof person>>;

const scopeOf = async (p: Person) => loadCrmScope((await loadViewer(p.id))!);
const post = (who: Person, path: string, body?: object) => request(app).post(path).set("Authorization", `Bearer ${who.token}`).send(body);

async function newLead(who: Person, number: string, ownerId?: string) {
  const options = (await request(app).get(crmRoutes.options.path).set("Authorization", `Bearer ${who.token}`).expect(200)).body;
  const projectId = options.projects.find((p: { isDefault: boolean }) => p.isDefault).id as string;
  const res = await post(who, crmRoutes.create.path, { projectId, name: "Amy Khan", phone: number, source: "REFERRAL", ownerId }).expect(
    200,
  );
  return res.body.id as string;
}

/** What the worker does: send everything queued. */
async function deliver() {
  for (const job of producer.take())
    if (job.queue === "push.send") await allHandlers()["push.send"]!(job.data as { notificationLogId: string });
}

describe("follow-up reminders", () => {
  const dueAt = "2030-01-10T10:00";
  const at = new Date("2030-01-10T06:00:30Z"); // 10:00:30 in Dubai

  it("reminds once when a follow-up comes due, and again only if it's rescheduled", async () => {
    const exec = await person();
    const leadId = await newLead(exec, "+971501234567");
    const task = await post(exec, crmRoutes.createTask.path, { leadId, title: "Ring back", type: "CALL", dueAt }).expect(200);
    await deliver();
    push.sent = [];

    expect(await runDueReminders(at)).toEqual({ sent: 1 });
    await runDueReminders(new Date(at.getTime() + 60_000));
    await deliver();
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({ title: "Follow-up due: Amy Khan", body: "Ring back", leadId, token: `fcm-${exec.id}` });

    await rescheduleTask(task.body.id, "2030-01-10T11:00", exec.actor, await scopeOf(exec));
    expect(await runDueReminders(new Date("2030-01-10T07:00:30Z"))).toEqual({ sent: 1 });
  });

  it("stays quiet for tasks not yet due, long past, or created automatically", async () => {
    const exec = await person();
    const leadId = await newLead(exec, "+971501234567");
    await post(exec, crmRoutes.createTask.path, { leadId, title: "Later", type: "CALL", dueAt: "2030-01-10T12:00" }).expect(200);
    await post(exec, crmRoutes.createTask.path, { leadId, title: "Old", type: "CALL", dueAt: "2030-01-10T08:00" }).expect(200);
    const auto = await post(exec, crmRoutes.createTask.path, { leadId, title: "Auto", type: "CALL", dueAt }).expect(200);
    await CrmTask.updateOne({ _id: auto.body.id }, { $set: { autoKey: "batch-urgency" } });
    expect(await runDueReminders(at)).toEqual({ sent: 0 });
  });
});

describe("assignment alerts", () => {
  it("one lead gets its own alert, a bulk assign gets one summary", async () => {
    const manager = await person("crm_manager");
    const exec = await person();
    const first = await newLead(manager, "+971501111111", "");
    const scope = await scopeOf(manager);
    await assignLead(first, exec.id, manager.actor, scope);
    await deliver();
    expect(push.sent).toEqual([expect.objectContaining({ title: "Lead assigned to you", leadId: first })]);

    push.sent = [];
    const ids = [
      await newLead(manager, "+971502222222", ""),
      await newLead(manager, "+971503333333", ""),
      await newLead(manager, "+971504444444", ""),
    ];
    await bulkAssignLeads({ ids }, exec.id, manager.actor, scope);
    await deliver();
    expect(push.sent).toEqual([expect.objectContaining({ title: "3 new leads assigned to you" })]);
  });

  it("sends nothing to someone with no phone signed in, and doesn't tell people what they did themselves", async () => {
    const manager = await person("crm_manager");
    const noPhone = await person("sales_executive", false);
    await newLead(manager, "+971501111111", noPhone.id);
    await newLead(manager, "+971502222222");
    await deliver();
    expect(push.sent).toEqual([]);
    expect(await NotificationLog.countDocuments({ channel: "PUSH" })).toBe(0);
  });

  it("stops using a dead push token without signing the phone out", async () => {
    const manager = await person("crm_manager");
    const exec = await person();
    push.tokenInvalid = true;
    await newLead(manager, "+971501111111", exec.id);
    await deliver();
    const device = (await CrmDevice.findOne({ userId: exec.id }).lean())!;
    expect(device.fcmToken).toBeNull();
    expect(device.revokedAt).toBeNull();
    expect((await NotificationLog.findOne({ channel: "PUSH" }).lean())!.status).toBe("SKIPPED");
  });
});

describe("the calls report", () => {
  const sync = (who: Person, number: string, durationSec: number) =>
    post(who, "/api/v1/mobile/calls/sync", {
      trackingOn: true,
      calls: [{ number, countryIso: "AE", startedAt: Date.now() + 60_000, durationSec, direction: "OUT" }],
    }).expect(200);
  const report = (who: Person) => request(app).get(crmRoutes.callReport.path).set("Authorization", `Bearer ${who.token}`);

  /** The report isn't a phone route, so ask for it the way the web CRM's API route does. */
  const asWeb = async (who: Person) => getCallReport({}, await scopeOf(who));

  it("isn't open to a phone at all", async () => {
    const admin = await person("crm_admin");
    await report(admin).expect(404);
    await post(admin, crmRoutes.removeDevice.path.replace(":id", "x")).expect(404);
  });

  it("adds up calls per person, lists people at zero, and shows phones to those who can act on them", async () => {
    const manager = await person("crm_manager");
    const busy = await person();
    const idle = await person();
    await newLead(busy, "+971501111111");
    await newLead(busy, "+971502222222");
    await sync(busy, "+971501111111", 120);
    await sync(busy, "+971502222222", 3);
    const r = await asWeb(manager);
    expect(r.totals).toEqual({ calls: 2, connected: 1, talkSec: 123 });
    expect(r.canManageDevices).toBe(true);
    expect(r.rows[0]).toMatchObject({ userId: busy.id, calls: 2, connected: 1, talkSec: 123, leads: 2 });
    expect(r.rows[0]!.device).toMatchObject({ model: "Test Phone", status: "tracking" });
    expect(r.rows.find((x) => x.userId === idle.id)).toMatchObject({ calls: 0, talkSec: 0, device: { status: "silent" } });
  });

  it("says when a phone has stopped: permission off, or nothing for a day", async () => {
    const manager = await person("crm_manager");
    const off = await person();
    const quiet = await person();
    await post(off, "/api/v1/mobile/calls/sync", { trackingOn: false, calls: [] }).expect(200);
    await post(quiet, "/api/v1/mobile/calls/sync", { trackingOn: true, calls: [] }).expect(200);
    const statusOf = async (p: Person) => (await asWeb(manager)).rows.find((x) => x.userId === p.id)!.device!.status;
    expect(await statusOf(off)).toBe("off");
    expect(await statusOf(quiet)).toBe("tracking");
    await CrmDevice.updateOne({ userId: quiet.id }, { $set: { lastSyncAt: new Date(Date.now() - 25 * 3_600_000) } });
    expect(await statusOf(quiet)).toBe("silent");
  });

  it("limits a project manager to their projects and hides phones from them", async () => {
    const admin = await person("crm_admin");
    const pm = await person("project_manager");
    const exec = await person();
    const elsewhere = await person();
    const projectId = await createProject({ name: "Autumn", code: "AUTUMN" }, admin.actor, await scopeOf(admin));
    await Project.updateOne({ _id: projectId }, { $set: { managerIds: [pm.id], memberIds: [exec.id] } });
    await post(exec, crmRoutes.create.path, { projectId, name: "Mine", phone: "+971501111111", source: "REFERRAL" }).expect(200);
    await newLead(elsewhere, "+971502222222");
    await sync(exec, "+971501111111", 60);
    await sync(elsewhere, "+971502222222", 60);

    const r = await asWeb(pm);
    expect(r.totals.calls).toBe(1);
    expect(r.canManageDevices).toBe(false);
    expect(r.rows.map((x) => x.userId)).toEqual([exec.id]);
    expect(r.rows[0]!.device).toBeNull();
  });

  it("a removed phone stops working on its next request", async () => {
    const manager = await person("crm_manager");
    const exec = await person();
    const device = (await CrmDevice.findOne({ userId: exec.id }).lean())!;
    await removeDevice(String(device._id), manager.actor);
    await request(app).get(crmRoutes.leads.path).set("Authorization", `Bearer ${exec.token}`).expect(401);
  });
});
