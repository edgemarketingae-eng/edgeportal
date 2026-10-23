import { Lead, withTx } from "@edge/db";
import { now } from "@edge/domain/clock";
import { LEAD_CONTACT_TYPES, type FollowUpType, type LeadTouchType } from "@edge/domain/crm/enums";
import type { Actor } from "@edge/domain/enums";
import { TransitionError } from "../errors";
import { createTaskInTx, loadLead, localDate, recordActivity, touchPatch, touchToTaskType } from "./common";
import type { CrmScope } from "./scope";

export interface ActivityWrite {
  type: LeadTouchType;
  body?: string;
  outcome?: string;
  direction?: string;
  nextFollowUpAt?: string;
  nextFollowUpTitle?: string;
  nextFollowUpType?: string;
}

/** Log a note, call, WhatsApp, email or meeting; optionally schedule the next follow-up in the same transaction. */
export async function addActivity(id: string, input: ActivityWrite, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const lead = await loadLead(id, scope);
  if (lead.mergedIntoId) throw new TransitionError("This lead was merged into another lead");
  const dueAt = localDate(input.nextFollowUpAt, "nextFollowUpAt");
  const at = now();
  const isContact = (LEAD_CONTACT_TYPES as readonly string[]).includes(input.type);
  const activityId = await withTx(async () => {
    const a = await recordActivity(lead._id, input.type, actor, {
      body: input.body?.trim() || null,
      outcome: input.outcome || null,
      direction: input.direction || (isContact ? "OUT" : null),
    });
    const { set, autoStage } = touchPatch(lead, input.type, at);
    await Lead.updateOne({ _id: lead._id }, { $set: set });
    if (autoStage) await recordActivity(lead._id, "STAGE_CHANGED", actor, { data: { from: lead.stage, to: autoStage, auto: true } });
    if (dueAt) {
      await createTaskInTx(
        { projectId: lead.projectId, leadId: lead._id, defaultAssigneeId: lead.ownerId ?? null },
        { title: input.nextFollowUpTitle?.trim() || "Follow up", type: (input.nextFollowUpType as FollowUpType) || touchToTaskType(input.type), dueAt },
        actor,
      );
    }
    return a._id;
  });
  return String(activityId);
}
