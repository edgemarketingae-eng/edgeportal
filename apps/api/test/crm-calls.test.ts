import { crmRoutes, mobileRoutes } from "@edge/contracts";
import { CrmDevice, CrmTask, Lead, LeadActivity, LeadCall } from "@edge/db";
import { createStaff, deleteLead, ingestInboundLead, loadCrmScope, loadViewer, mergeLeads, registerDevice } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, resetDb, startApi } from "./helpers";

let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(resetDb);

const PASSWORD = "StaffPass!2026";
let seq = 0;

async function phone(role = "sales_executive") {
  seq += 1;
  const email = `${role}-${seq}@edge.test`;
  const { id } = await createStaff({ name: `${role} ${seq}`, email, roleKeys: [role], password: PASSWORD }, { type: "SYSTEM" });
  return { id, token: await registerDevice(id, { appVersion: "0.1.0" }) };
}
type Phone = Awaited<ReturnType<typeof phone>>;

const get = (who: Phone, path: string) => request(app).get(path).set("Authorization", `Bearer ${who.token}`);
const post = (who: Phone, path: string, body?: object) => request(app).post(path).set("Authorization", `Bearer ${who.token}`).send(body);

async function newLead(who: Phone, number: string, name = "Amy Khan") {
  const options = (await get(who, crmRoutes.options.path).expect(200)).body;
  const projectId = options.projects.find((p: { isDefault: boolean }) => p.isDefault).id as string;
  const res = await post(who, crmRoutes.create.path, { projectId, name, phone: number, source: "REFERRAL", allowDuplicate: true }).expect(
    200,
  );
  return res.body.id as string;
}

const scopeOf = async (who: Phone) => loadCrmScope((await loadViewer(who.id))!);

const NUMBER = "+971501234567";
const inAMinute = (n = 1) => Date.now() + n * 60_000;
const row = (over: object = {}) => ({
  number: NUMBER,
  countryIso: "AE",
  startedAt: inAMinute(),
  durationSec: 90,
  direction: "OUT",
  ...over,
});
const sync = (who: Phone, calls: unknown[], trackingOn = true) =>
  post(who, mobileRoutes.syncCalls.path, { calls, trackingOn, appVersion: "0.1.0" }).expect(200);
const sheet = (who: Phone, leadId: string, over: object = {}) =>
  post(who, mobileRoutes.saveCallSheet.path, { ...row(), leadId, outcome: "ANSWERED", body: "Wants the November batch", ...over });

const callEntries = (leadId: string) => LeadActivity.countDocuments({ leadId, type: "CALL" });
const timeline = async (who: Phone, leadId: string) =>
  (await get(who, crmRoutes.lead.path.replace(":id", leadId)).expect(200)).body.activities as {
    type: string;
    outcome: string | null;
    body: string | null;
    direction: string | null;
    data: Record<string, unknown>;
  }[];

describe("call upload", () => {
  it("stores calls with leads and drops the rest without a trace", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const res = await sync(exec, [row(), row({ number: "+971509999999" })]);
    expect(res.body.stored).toBe(1);
    expect(res.body.awaitingSheet).toEqual([expect.objectContaining({ leadId, leadName: "Amy Khan", durationSec: 90, direction: "OUT" })]);
    expect(await LeadCall.countDocuments()).toBe(1);
    expect(await LeadCall.countDocuments({ phone: "+971509999999" })).toBe(0);
    const device = (await CrmDevice.findOne({ userId: exec.id }).lean())!;
    expect(device.trackingOn).toBe(true);
    expect(device.lastSyncAt).toBeTruthy();
  });

  it("matches local formats, and one bad row doesn't stall the batch", async () => {
    const exec = await phone();
    await newLead(exec, NUMBER);
    const res = await sync(exec, [{ junk: true }, "nonsense", row({ number: "not a number" }), row({ number: "050 123 4567" })]);
    expect(res.body.stored).toBe(1);
  });

  it("repeat uploads leave one call and one timeline entry, keeping the longer duration", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const call = row();
    await sync(exec, [call]);
    expect((await sync(exec, [call])).body.awaitingSheet).toEqual([]);
    await sync(exec, [{ ...call, durationSec: 120 }]);
    expect(await LeadCall.countDocuments()).toBe(1);
    expect((await LeadCall.findOne().lean())!.durationSec).toBe(120);
    expect(await callEntries(leadId)).toBe(1);
  });

  it("reports tracking off even with nothing to upload", async () => {
    const exec = await phone();
    await sync(exec, [], false);
    expect((await CrmDevice.findOne({ userId: exec.id }).lean())!.trackingOn).toBe(false);
  });

  it("keeps a call on someone else's lead but doesn't reveal it to the caller", async () => {
    const owner = await phone();
    const other = await phone();
    const leadId = await newLead(owner, NUMBER);
    const res = await sync(other, [row()]);
    expect(res.body).toEqual({ stored: 1, awaitingSheet: [] });
    expect((await LeadCall.findOne().lean())!.leadId.toString()).toBe(leadId);
  });

  it("prefers the caller's own lead when a number is on several", async () => {
    const someone = await phone();
    const exec = await phone();
    await newLead(someone, NUMBER, "Someone else's");
    const mine = await newLead(exec, NUMBER, "Mine");
    await sync(exec, [row()]);
    expect((await LeadCall.findOne().lean())!.leadId.toString()).toBe(mine);
  });
});

describe("the after-call sheet and the upload together", () => {
  it("gives one entry when the sheet is saved first", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const call = row();
    await sheet(exec, leadId, call).expect(200);
    await sync(exec, [call]);
    expect(await callEntries(leadId)).toBe(1);
    const [entry] = (await timeline(exec, leadId)).filter((a) => a.type === "CALL");
    expect(entry).toMatchObject({ outcome: "ANSWERED", body: "Wants the November batch", data: { tracked: true, durationSec: 90 } });
  });

  it("gives one entry when the upload lands first", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const call = row();
    await sync(exec, [call]);
    await sheet(exec, leadId, call).expect(200);
    expect(await callEntries(leadId)).toBe(1);
    expect((await LeadCall.findOne().lean())!.outcome).toBe("ANSWERED");
  });

  it("gives one entry when both land at the same moment", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const call = row();
    await Promise.all([sync(exec, [call]), sheet(exec, leadId, call).expect(200), sync(exec, [call])]);
    expect(await LeadCall.countDocuments()).toBe(1);
    expect(await callEntries(leadId)).toBe(1);
  });

  it("a retried save can't create a second follow-up", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const call = row();
    const followUp = { nextFollowUpAt: "2030-01-10T10:00", nextFollowUpTitle: "Call back" };
    await sheet(exec, leadId, { ...call, ...followUp }).expect(200);
    await sheet(exec, leadId, { ...call, ...followUp, outcome: "BUSY", body: "changed" }).expect(200);
    expect(await CrmTask.countDocuments({ leadId, title: "Call back" })).toBe(1);
    expect((await LeadCall.findOne().lean())!.outcome).toBe("ANSWERED");
    expect((await Lead.findById(leadId).lean())!.nextFollowUpAt).toBeTruthy();
  });

  it("closes the follow-up the call was for", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const res = await post(exec, crmRoutes.createTask.path, { leadId, title: "Ring back", type: "CALL", dueAt: "2030-01-10T10:00" }).expect(
      200,
    );
    await sheet(exec, leadId, { taskId: res.body.id }).expect(200);
    expect((await CrmTask.findById(res.body.id).lean())!.status).toBe("DONE");
    expect((await Lead.findById(leadId).lean())!.nextFollowUpAt).toBeNull();
  });

  it("a sheet saved during the call picks up the real time and duration when the row arrives", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const tappedAt = Date.now();
    await sheet(exec, leadId, { startedAt: tappedAt, durationSec: 0, estimated: true }).expect(200);
    expect((await sync(exec, [row({ startedAt: tappedAt + 4000, durationSec: 240 })])).body.awaitingSheet).toEqual([]);
    expect(await LeadCall.countDocuments()).toBe(1);
    const call = (await LeadCall.findOne().lean())!;
    expect(call).toMatchObject({ durationSec: 240, estimated: false, outcome: "ANSWERED" });
    expect(call.startedAt.getTime()).toBe(Math.floor((tappedAt + 4000) / 1000) * 1000);
    expect(await callEntries(leadId)).toBe(1);
  });

  it("a sheet with no row yet attaches to a row that got there first", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const tappedAt = Date.now();
    await sync(exec, [row({ startedAt: tappedAt + 3000 })]);
    await sheet(exec, leadId, { startedAt: tappedAt, durationSec: 0, estimated: true }).expect(200);
    expect(await LeadCall.countDocuments()).toBe(1);
    expect((await LeadCall.findOne().lean())!).toMatchObject({ durationSec: 90, outcome: "ANSWERED" });
  });

  it("an old estimate doesn't swallow a later, separate call", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const tappedAt = Date.now();
    await sheet(exec, leadId, { startedAt: tappedAt, durationSec: 0, estimated: true, outcome: "NO_ANSWER" }).expect(200);
    await sync(exec, [row({ startedAt: tappedAt + 45 * 60_000, durationSec: 30 })]);
    expect(await LeadCall.countDocuments()).toBe(2);
  });

  it("a phone can't log a call the old way, but other contacts still work", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const path = crmRoutes.activity.path.replace(":id", leadId);
    await post(exec, path, { type: "CALL", outcome: "ANSWERED" }).expect(409);
    await post(exec, path, { type: "WHATSAPP", body: "Sent the brochure" }).expect(200);
  });
});

describe("what a tracked call does to the lead", () => {
  const leadOf = async (id: string) => (await Lead.findById(id).lean())!;

  it("an outgoing attempt counts as contact, at the call's own time", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const startedAt = inAMinute(5);
    await sync(exec, [row({ startedAt, durationSec: 0 })]);
    const lead = await leadOf(leadId);
    expect(lead.stage).toBe("CONTACTED");
    expect(lead.firstContactedAt!.getTime()).toBe(Math.floor(startedAt / 1000) * 1000);
    expect((await LeadCall.findOne().lean())!.connected).toBe(false);
  });

  it("a missed call from the lead isn't a response", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    await sync(exec, [row({ direction: "MISSED", durationSec: 0 })]);
    const lead = await leadOf(leadId);
    expect(lead.stage).toBe("NEW");
    expect(lead.firstContactedAt).toBeNull();
    expect(lead.lastActivityAt).toBeTruthy();
  });

  it("a late upload never moves dates backwards, but the earliest contact wins", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    const later = inAMinute(30);
    const earlier = inAMinute(10);
    await sync(exec, [row({ startedAt: later })]);
    await sync(exec, [row({ startedAt: earlier })]);
    const lead = await leadOf(leadId);
    expect(lead.lastContactedAt!.getTime()).toBe(Math.floor(later / 1000) * 1000);
    expect(lead.firstContactedAt!.getTime()).toBe(Math.floor(earlier / 1000) * 1000);
  });

  it("a call from before the lead existed changes nothing", async () => {
    const exec = await phone();
    const leadId = await newLead(exec, NUMBER);
    await sync(exec, [row({ startedAt: Date.now() - 86_400_000 })]);
    const lead = await leadOf(leadId);
    expect(lead.stage).toBe("NEW");
    expect(lead.firstContactedAt).toBeNull();
    expect(await callEntries(leadId)).toBe(1);
  });
});

describe("numbers and lead changes", () => {
  it("calls to a lead's second number are matched", async () => {
    const exec = await phone();
    const whatsapp = "+971501112222";
    const callNumber = "+971503334444";
    const { leadId } = await ingestInboundLead("website", { name: "Sam", phone: whatsapp, country: "AE" } as never, null, {
      altPhone: callNumber,
    });
    await Lead.updateOne({ _id: leadId }, { $set: { ownerId: exec.id } });
    expect((await Lead.findById(leadId).lean())!.altPhones).toEqual([callNumber]);
    const call = row({ number: callNumber, durationSec: 40 });
    const { awaitingSheet } = (await sync(exec, [call])).body;
    expect(awaitingSheet).toEqual([expect.objectContaining({ leadId, phone: callNumber })]);
    // The phone sends that number back with the outcome. Using the lead's main number here would split one call in two.
    await sheet(exec, leadId, { ...call, number: awaitingSheet[0].phone }).expect(200);
    expect(await LeadCall.countDocuments()).toBe(1);
    expect(await callEntries(leadId)).toBe(1);
  });

  it("a second enquiry adds a new call number to a known lead", async () => {
    const number = "+971505556666";
    const { leadId } = await ingestInboundLead("website", { name: "Sam", phone: number, country: "AE" } as never, null);
    await ingestInboundLead("website", { name: "Sam", phone: number, country: "AE" } as never, null, { altPhone: "+971507778888" });
    expect((await Lead.findById(leadId).lean())!.altPhones).toEqual(["+971507778888"]);
  });

  it("merging moves calls and keeps the old number reachable", async () => {
    const manager = await phone("crm_manager");
    const exec = await phone();
    const keep = await newLead(exec, "+971501111111", "Keep");
    const gone = await newLead(exec, "+971502222222", "Gone");
    await sync(exec, [row({ number: "+971502222222" })]);
    await mergeLeads(keep, gone, { type: "USER", id: manager.id }, await scopeOf(manager));
    expect((await LeadCall.findOne().lean())!.leadId.toString()).toBe(keep);
    expect(await callEntries(keep)).toBe(1);
    await sync(exec, [row({ number: "+971502222222", startedAt: inAMinute(9) })]);
    expect(await LeadCall.countDocuments({ leadId: keep })).toBe(2);
  });

  it("deleting a lead deletes its calls", async () => {
    const admin = await phone("crm_admin");
    const leadId = await newLead(admin, NUMBER);
    await sync(admin, [row()]);
    expect(await LeadCall.countDocuments()).toBe(1);
    await deleteLead(leadId, { type: "USER", id: admin.id }, await scopeOf(admin));
    expect(await LeadCall.countDocuments()).toBe(0);
  });
});

describe("the Today screen", () => {
  it("shows what's due, who's new oldest first, the pool and today's calls", async () => {
    const exec = await phone();
    const first = await newLead(exec, "+971501111111", "First");
    const second = await newLead(exec, "+971502222222", "Second");
    await Lead.updateOne({ _id: first }, { $set: { createdAt: new Date(Date.now() - 3_600_000) } });
    await post(exec, crmRoutes.createTask.path, { leadId: second, title: "Call", type: "CALL", dueAt: "2020-01-10T10:00" }).expect(200);
    await sync(exec, [row({ number: "+971503333333" })]);
    const today = (await get(exec, mobileRoutes.today.path).expect(200)).body;
    expect(today.newLeads.map((l: { name: string }) => l.name)).toEqual(["First", "Second"]);
    expect(today.tasks).toHaveLength(1);
    expect(today.calls).toEqual({ calls: 0, connected: 0, talkSec: 0 });
    const third = await newLead(exec, "+971503333333", "Third");
    await sync(exec, [row({ number: "+971503333333" })]);
    expect(third).toBeTruthy();
    expect((await get(exec, mobileRoutes.today.path).expect(200)).body.calls).toEqual({ calls: 1, connected: 1, talkSec: 90 });
  });
});
