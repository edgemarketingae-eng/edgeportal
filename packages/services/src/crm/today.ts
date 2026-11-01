import type { MobileToday } from "@edge/contracts";
import { CrmTask, type CrmTaskDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { OPEN_TASK_STATUSES } from "@edge/domain/crm/enums";
import { startOfDubaiDay } from "@edge/domain/dates";
import { callStatsToday } from "./calls";
import { tasksToDtos } from "./common";
import { listLeads } from "./leads";
import type { CrmScope } from "./scope";

const LIST_SIZE = 30;

/** The executive's home screen: what's due, who's new (oldest waiting first), what can be claimed, and today's calls. */
export async function getMobileToday(scope: CrmScope): Promise<MobileToday> {
  const [tasks, newLeads, pool, calls] = await Promise.all([
    CrmTask.find({ assigneeId: scope.me, status: { $in: [...OPEN_TASK_STATUSES] }, dueAt: { $lt: startOfDubaiDay(now(), 1) } })
      .sort({ dueAt: 1, order: 1 })
      .limit(LIST_SIZE)
      .lean(),
    listLeads({ owner: "me", stage: "NEW", sort: "oldest", pageSize: LIST_SIZE }, scope),
    listLeads({ owner: "unassigned", stage: "NEW", sort: "oldest", pageSize: LIST_SIZE }, scope),
    callStatsToday(scope.me),
  ]);
  return { tasks: await tasksToDtos(tasks as CrmTaskDoc[]), newLeads: newLeads.rows, pool: pool.rows, calls };
}
