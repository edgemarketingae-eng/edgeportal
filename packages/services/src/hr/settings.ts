import type { HrSettingsDto, HrSettingsInput } from "@edge/contracts";
import { audit } from "../audit";
import { getSetting, setSetting } from "../settings";
import type { HrActor } from "./common";

export async function getHrSettings(): Promise<HrSettingsDto> {
  const [leaveTypes, calendar] = await Promise.all([getSetting("hr.leaveTypes"), getSetting("hr.calendar")]);
  return { leaveTypes, weeklyOffDays: calendar.weeklyOffDays, holidays: calendar.holidays };
}

function newKey(name: string, taken: Set<string>) {
  const stem =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "leave";
  let key = stem;
  for (let n = 2; taken.has(key); n += 1) key = `${stem}-${n}`;
  taken.add(key);
  return key;
}

/** Types can only be switched off, never removed: requests and balances keep pointing at their key. */
export async function saveHrSettings(input: HrSettingsInput, actor: HrActor) {
  const before = await getSetting("hr.leaveTypes");
  const taken = new Set(before.map((t) => t.key));
  const sent = input.leaveTypes.map((t) => ({ ...t, name: t.name.trim(), key: t.key && taken.has(t.key) ? t.key : newKey(t.name, taken) }));
  const kept = before.filter((t) => !sent.some((s) => s.key === t.key)).map((t) => ({ ...t, active: false }));
  const leaveTypes = [...sent, ...kept];
  const holidays = [...new Map(input.holidays.map((h) => [h.day, { day: h.day, name: h.name.trim() }])).values()].sort((a, b) =>
    a.day.localeCompare(b.day),
  );
  const weeklyOffDays = [...new Set(input.weeklyOffDays)].sort();
  await setSetting("hr.leaveTypes", leaveTypes, actor.id);
  await setSetting("hr.calendar", { weeklyOffDays, holidays }, actor.id);
  await audit({
    actor,
    action: "hr.settings.update",
    entityType: "Setting",
    entityId: "hr",
    after: {
      leaveTypes: leaveTypes.map((t) => ({ key: t.key, daysPerYear: t.daysPerYear, active: t.active })),
      weeklyOffDays,
      holidays: holidays.length,
    },
  });
}
