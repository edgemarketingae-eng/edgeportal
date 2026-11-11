import { Lead, LeadCall, Types } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { LEAD_SOURCE_LABELS } from "@edge/domain/crm/labels";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  bulkDeleteLeads,
  createLead,
  createProject,
  createStaff,
  getCallReport,
  getCrmDashboard,
  getDefaultProject,
  getLeaderboard,
  listDeposits,
  listLeads,
  loadCrmScope,
  loadViewer,
  logDeposit,
  type CrmScope,
} from "../src";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  freezeClock("2026-10-06T06:00:00Z"); // 10:00 on 6 Oct in Dubai
});
afterEach(() => setClock(null));

let n = 0;
async function person(role: string, name = `${role} ${n}`) {
  n += 1;
  const { id } = await createStaff(
    { name, email: `${role}-${n}-${Date.now()}@edge.test`, roleKeys: [role], password: "StaffPass!2026" },
    { type: "SYSTEM" },
  );
  const viewer = (await loadViewer(id))!;
  return { id, actor: { type: "USER" as const, id }, scope: (): Promise<CrmScope> => loadCrmScope(viewer) };
}
const general = async () => String((await getDefaultProject())._id);
const at = (s: string) => new Date(s);
/** Sets dates and fields straight on the document (Mongoose keeps createdAt immutable and stamps the real clock). */
const set = (id: string, fields: Record<string, unknown>) => Lead.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: fields });
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("sorting the leads list by any column", () => {
  it("sorts each column both ways, empty values last", async () => {
    const admin = await person("crm_admin");
    const zara = await person("sales_executive", "Zara Owner");
    const aaron = await person("sales_executive", "aaron owner");
    const scope = await admin.scope();
    const alpha = await createProject({ name: "Alpha team", code: "ALPHA", memberIds: [zara.id, aaron.id] }, admin.actor, scope);
    const zulu = await createProject({ name: "zulu team", code: "ZULU", memberIds: [zara.id, aaron.id] }, admin.actor, scope);
    const s = await admin.scope();
    const beta = await createLead(
      { projectId: zulu, name: "beta", phone: "+971501000003", source: "WEBSITE", ownerId: zara.id },
      admin.actor,
      s,
    );
    const first = await createLead(
      { projectId: alpha, name: "Alpha", phone: "+971501000001", source: "REFERRAL", ownerId: aaron.id },
      admin.actor,
      s,
    );
    const charlie = await createLead(
      { projectId: await general(), name: "charlie", phone: "+971501000002", source: "INSTAGRAM", ownerId: "" },
      admin.actor,
      s,
    );
    await set(beta, {
      stage: "NEW",
      nextFollowUpAt: at("2026-10-10T06:00:00Z"),
      lastActivityAt: at("2026-10-03T06:00:00Z"),
      createdAt: at("2026-10-01T06:00:00Z"),
    });
    await set(first, {
      stage: "QUALIFIED",
      nextFollowUpAt: null,
      lastActivityAt: at("2026-10-05T06:00:00Z"),
      createdAt: at("2026-10-03T06:00:00Z"),
    });
    await set(charlie, {
      stage: "CONTACTED",
      nextFollowUpAt: at("2026-10-08T06:00:00Z"),
      lastActivityAt: null,
      createdAt: at("2026-10-02T06:00:00Z"),
    });

    const order = async (sort: string, dir?: "asc" | "desc") =>
      names((await listLeads({ view: "all", sort: sort as never, ...(dir ? { dir } : {}) }, s)).rows);
    expect(await order("name")).toEqual(["Alpha", "beta", "charlie"]); // case doesn't matter
    expect(await order("name", "desc")).toEqual(["charlie", "beta", "Alpha"]);
    expect(await order("phone")).toEqual(["Alpha", "charlie", "beta"]);
    expect(await order("stage")).toEqual(["beta", "charlie", "Alpha"]); // pipeline order, not A-Z
    expect(await order("stage", "desc")).toEqual(["Alpha", "charlie", "beta"]);
    const byLabel = [
      ["beta", LEAD_SOURCE_LABELS.WEBSITE],
      ["Alpha", LEAD_SOURCE_LABELS.REFERRAL],
      ["charlie", LEAD_SOURCE_LABELS.INSTAGRAM],
    ]
      .sort((a, b) => a[1]!.localeCompare(b[1]!))
      .map((x) => x[0]);
    expect(await order("source")).toEqual(byLabel);
    expect(await order("project")).toEqual(["Alpha", "charlie", "beta"]); // Alpha team, General, zulu team
    expect(await order("project", "desc")).toEqual(["beta", "charlie", "Alpha"]);
    expect(await order("owner")).toEqual(["Alpha", "beta", "charlie"]); // aaron, Zara, then unassigned
    expect(await order("owner", "desc")).toEqual(["beta", "Alpha", "charlie"]); // unassigned still last
    expect(await order("followUp")).toEqual(["charlie", "beta", "Alpha"]); // no follow-up last
    expect(await order("followUp", "desc")).toEqual(["beta", "charlie", "Alpha"]);
    expect(await order("activity")).toEqual(["Alpha", "beta", "charlie"]); // newest first, never-touched last
    expect(await order("activity", "asc")).toEqual(["beta", "Alpha", "charlie"]);
    expect(await order("created")).toEqual(["Alpha", "charlie", "beta"]);
    expect(await order("created", "asc")).toEqual(["beta", "charlie", "Alpha"]);
    // The older names the phone app and jobs send still mean what they did.
    expect(await order("recent")).toEqual(await order("activity"));
    expect(await order("oldest")).toEqual(await order("created", "asc"));
    // No sort: latest activity first, as before.
    expect(names((await listLeads({ view: "all" }, s)).rows)).toEqual(["Alpha", "beta", "charlie"]);
  });
});

describe("date filters", () => {
  it("filters leads by the Dubai days of the chosen date, and bulk actions follow", async () => {
    const admin = await person("crm_admin");
    const s = await admin.scope();
    const g = await general();
    const mk = async (name: string, phone: string) => createLead({ projectId: g, name, phone, source: "WEBSITE" }, admin.actor, s);
    const [lateFifth, midnight, morning] = [
      await mk("Late fifth", "+971502000001"),
      await mk("Midnight", "+971502000002"),
      await mk("Morning", "+971502000003"),
    ];
    await set(lateFifth, { createdAt: at("2026-10-05T19:59:00Z"), lastActivityAt: at("2026-10-06T05:00:00Z"), nextFollowUpAt: null }); // 23:59 on the 5th
    await set(midnight, { createdAt: at("2026-10-05T20:00:00Z"), lastActivityAt: null, nextFollowUpAt: at("2026-10-07T06:00:00Z") }); // 00:00 on the 6th
    await set(morning, { createdAt: at("2026-10-06T05:00:00Z"), lastActivityAt: null, nextFollowUpAt: null });

    const list = async (f: Record<string, unknown>) => names((await listLeads({ view: "all", sort: "name", ...f }, s)).rows);
    expect(await list({ from: "2026-10-06", to: "2026-10-06" })).toEqual(["Midnight", "Morning"]);
    expect(await list({ from: "2026-10-05", to: "2026-10-05" })).toEqual(["Late fifth"]);
    expect(await list({ from: "2026-10-05", to: "2026-10-06" })).toEqual(["Late fifth", "Midnight", "Morning"]);
    expect(await list({ from: "2026-10-06", to: "2026-10-06", dateOn: "activity" })).toEqual(["Late fifth"]);
    expect(await list({ from: "2026-10-07", to: "2026-10-07", dateOn: "followUp" })).toEqual(["Midnight"]);
    expect(await list({ created: "today" })).toEqual(["Midnight", "Morning"]); // the older preset still works

    const today = { view: "all" as const, from: "2026-10-06", to: "2026-10-06" };
    expect(await bulkDeleteLeads({ filters: today }, admin.actor, s)).toEqual({ deleted: 2, skipped: 0 });
    expect(await list({})).toEqual(["Late fifth"]);
  });

  it("filters deposits by deposit day, and the leaderboard, calls and dashboard by the chosen days", async () => {
    const admin = await person("crm_admin");
    const exec = await person("sales_executive", "Sam Seller");
    const s = await admin.scope();
    const g = await general();
    const a = await createLead(
      { projectId: g, name: "Depositor", phone: "+971503000001", source: "WEBSITE", ownerId: exec.id },
      admin.actor,
      s,
    );
    const b = await createLead(
      { projectId: g, name: "Older", phone: "+971503000002", source: "WEBSITE", ownerId: exec.id },
      admin.actor,
      s,
    );
    await set(a, { createdAt: at("2026-10-06T05:00:00Z") });
    await set(b, { createdAt: at("2026-09-20T06:00:00Z") });
    await logDeposit(a, { sequence: "FIRST", amount: "500", depositedAt: "2026-10-06", jetaFxClientId: "JFX1" }, admin.actor, s);
    await logDeposit(b, { sequence: "FIRST", amount: "300", depositedAt: "2026-10-04", jetaFxClientId: "JFX2" }, admin.actor, s);

    expect((await listDeposits({ from: "2026-10-06", to: "2026-10-06" }, s)).total).toBe(1);
    expect((await listDeposits({ from: "2026-10-01", to: "2026-10-06" }, s)).total).toBe(2);
    expect((await listDeposits({ period: "all", from: "2026-10-04", to: "2026-10-04" }, s)).rows[0]!.lead.name).toBe("Older");

    const row = async (q: Record<string, unknown>) => (await getLeaderboard(q, s)).rows.find((r) => r.id === exec.id)!;
    expect((await row({ from: "2026-10-06", to: "2026-10-06" })).newLeads).toBe(1);
    expect((await row({ from: "2026-09-01", to: "2026-10-06" })).newLeads).toBe(2);
    expect((await row({ period: "month" })).newLeads).toBe(1); // the older presets still work

    const base = {
      userId: new Types.ObjectId(exec.id),
      leadId: new Types.ObjectId(a),
      projectId: new Types.ObjectId(g),
      phone: "+971503000001",
      direction: "OUT" as const,
    };
    await LeadCall.create([
      { ...base, startedAt: at("2026-10-06T05:00:00Z"), durationSec: 60, connected: true },
      { ...base, startedAt: at("2026-09-01T05:00:00Z"), durationSec: 30, connected: true },
    ]);
    expect((await getCallReport({ from: "2026-10-06", to: "2026-10-06" }, s)).totals.calls).toBe(1);
    expect((await getCallReport({ period: "all" }, s)).totals.calls).toBe(2);
    expect((await getCallReport({}, s)).totals.calls).toBe(1); // default: today

    const day = await getCrmDashboard(s, { from: "2026-10-06", to: "2026-10-06" });
    expect(day.period).toMatchObject({ from: "2026-10-06", to: "2026-10-06", newLeads: 1 });
    expect(day.bySource.reduce((t, x) => t + x.leads, 0)).toBe(1);
    const all = await getCrmDashboard(s, { period: "all" });
    expect(all.period).toMatchObject({ from: null, to: null, newLeads: 2 });
    const phone = await getCrmDashboard(s); // what the phone app asks for: this month, by-source all time
    expect(phone.period).toMatchObject({ from: "2026-10-01", to: "2026-10-06", newLeads: 1 });
    expect(phone.bySource.reduce((t, x) => t + x.leads, 0)).toBe(2);
  });
});
