import type { CrmDashboardDto } from "@edge/contracts";
import { CrmTask, Lead, Types } from "@edge/db";
import { now } from "@edge/domain/clock";
import { OPEN_LEAD_STAGES, OPEN_TASK_STATUSES } from "@edge/domain/crm/enums";
import { dubaiDateString, startOfDubaiDay } from "@edge/domain/dates";
import { NotFoundError } from "../errors";
import { getSetting } from "../settings";
import { between, dayRange, hasDays, inRangeExpr, optId, productNames, startOfDubaiMonth, tasksToDtos, userNames } from "./common";
import { activeProducts, projectProducts } from "./products";
import { projectStats } from "./projects";
import { inProject, leadScopeFilter, projectsFor, taskScopeFilter, type CrmScope } from "./scope";

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Funnel, response times, sources, projects and team figures for everything in the viewer's scope (optionally one project). */
/** Leads (in scope) per product with a conversion whose date is in [from, to). */
function conversionsByProduct(base: Record<string, unknown>, from: Date | null, to: Date | null) {
  return Lead.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { ...base, convertedAt: { $ne: null } } },
    {
      $lookup: {
        from: "leadConversions",
        let: { lid: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ["$leadId", "$$lid"] }, inRangeExpr("$convertedAt", from, to)] } } },
          { $project: { productId: 1 } },
        ],
        as: "c",
      },
    },
    { $unwind: "$c" },
    { $group: { _id: "$c.productId", n: { $sum: 1 } } },
  ]);
}

export async function getCrmDashboard(
  scope: CrmScope,
  f: { project?: string; from?: string; to?: string; period?: "month" | "all" } = {},
): Promise<CrmDashboardDto> {
  const at = now();
  const project = optId(f.project);
  if (project && !inProject(scope, project)) throw new NotFoundError("Project");
  const base: Record<string, unknown> = { mergedIntoId: null, ...leadScopeFilter(scope), ...(project ? { projectId: project } : {}) };
  const taskBase: Record<string, unknown> = { ...taskScopeFilter(scope), ...(project ? { projectId: project } : {}) };
  const cfg = await getSetting("crm.config");
  const todayStart = startOfDubaiDay(at);
  const tomorrowStart = startOfDubaiDay(at, 1);
  const weekAgo = new Date(at.getTime() - 7 * 86_400_000);
  const monthStart = startOfDubaiMonth(at);
  const d90 = new Date(at.getTime() - 90 * 86_400_000);
  const d30 = new Date(at.getTime() - 30 * 86_400_000);
  const open = { $in: [...OPEN_TASK_STATUSES] };
  // The chosen period: from/to, all time, or (the phone app's view, with no choice) this month.
  const chosen = hasDays(f) || f.period != null;
  const p = hasDays(f) ? dayRange(f.from, f.to) : f.period === "all" ? { from: null, to: null } : { from: monthStart, to: null };
  const periodDays = hasDays(f)
    ? { from: f.from ?? null, to: f.to ?? null }
    : f.period === "all"
      ? { from: null, to: null }
      : { from: `${dubaiDateString(at).slice(0, 7)}-01`, to: dubaiDateString(at) };
  /** A date field within the period (an open period still needs the date to be set). */
  const inPeriod = between(p.from, p.to) ?? { $ne: null };

  const [
    byStage,
    newToday,
    newWeek,
    uncontacted,
    convertedMonth,
    lostMonth,
    converted90,
    lost90,
    responses,
    bySource,
    overdueTasks,
    dueToday,
    myTasks,
    perOwner,
    overduePerAssignee,
    visibleProjects,
    productsMonth,
    products,
    periodNew,
    periodConverted,
    periodLost,
    productsPeriod,
  ] = await Promise.all([
    Lead.aggregate<{ _id: string; n: number }>([{ $match: base }, { $group: { _id: "$stage", n: { $sum: 1 } } }]),
    Lead.countDocuments({ ...base, createdAt: { $gte: todayStart } }),
    Lead.countDocuments({ ...base, createdAt: { $gte: weekAgo } }),
    Lead.countDocuments({
      ...base,
      stage: "NEW",
      firstContactedAt: null,
      createdAt: { $lt: new Date(at.getTime() - cfg.followUpSlaHours * 3_600_000) },
    }),
    Lead.countDocuments({ ...base, convertedAt: { $gte: monthStart } }),
    Lead.countDocuments({ ...base, stage: "LOST", stageChangedAt: { $gte: monthStart } }),
    Lead.countDocuments({ ...base, convertedAt: { $gte: d90 } }),
    Lead.countDocuments({ ...base, stage: "LOST", stageChangedAt: { $gte: d90 } }),
    Lead.find({ ...base, firstContactedAt: { $gte: d30 } }, { firstContactedAt: 1, createdAt: 1 })
      .limit(2000)
      .lean(),
    Lead.aggregate<{ _id: string; leads: number; contacted: number; converted: number; paid: number }>([
      // All time unless a period was chosen (leads added in it).
      { $match: chosen && (p.from || p.to) ? { ...base, createdAt: between(p.from, p.to) } : base },
      {
        $lookup: {
          from: "enrollments",
          let: { sid: "$studentId" },
          pipeline: [
            {
              $match: {
                $expr: { $and: [{ $eq: ["$studentId", "$$sid"] }, { $eq: ["$isCurrent", true] }, { $ne: ["$paymentState", "UNPAID"] }] },
              },
            },
            { $project: { _id: 1 } },
          ],
          as: "paidEnrollment",
        },
      },
      {
        $group: {
          _id: "$source",
          leads: { $sum: 1 },
          contacted: { $sum: { $cond: [{ $ne: ["$firstContactedAt", null] }, 1, 0] } },
          converted: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$convertedAt", null] }, null] }, 1, 0] } },
          paid: { $sum: { $cond: [{ $gt: [{ $size: "$paidEnrollment" }, 0] }, 1, 0] } },
        },
      },
      { $sort: { leads: -1 } },
    ]),
    CrmTask.countDocuments({ ...taskBase, status: open, dueAt: { $lt: todayStart } }),
    CrmTask.countDocuments({ ...taskBase, status: open, dueAt: { $gte: todayStart, $lt: tomorrowStart } }),
    CrmTask.find({ assigneeId: scope.me, status: open, dueAt: { $lt: tomorrowStart }, ...(project ? { projectId: project } : {}) })
      .sort({ dueAt: 1 })
      .limit(10)
      .lean(),
    Lead.aggregate<{ _id: Types.ObjectId; open: number; convertedMonth: number; converted: number }>([
      { $match: { ...base, ownerId: { $ne: null } } },
      {
        $group: {
          _id: "$ownerId",
          open: { $sum: { $cond: [{ $in: ["$stage", [...OPEN_LEAD_STAGES]] }, 1, 0] } },
          convertedMonth: { $sum: { $cond: [{ $gte: ["$convertedAt", monthStart] }, 1, 0] } },
          converted: { $sum: { $cond: [inRangeExpr("$convertedAt", p.from, p.to), 1, 0] } },
        },
      },
    ]),
    CrmTask.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { ...taskBase, status: open, dueAt: { $lt: todayStart }, assigneeId: { $ne: null } } },
      { $group: { _id: "$assigneeId", n: { $sum: 1 } } },
    ]),
    projectsFor(scope),
    conversionsByProduct(base, monthStart, null),
    // One project: what it sells. Products it no longer sells still show while they have conversions to show.
    project ? projectProducts(project) : activeProducts(),
    Lead.countDocuments({ ...base, createdAt: inPeriod }),
    Lead.countDocuments({ ...base, convertedAt: inPeriod }),
    Lead.countDocuments({ ...base, stage: "LOST", stageChangedAt: inPeriod }),
    chosen ? conversionsByProduct(base, p.from, p.to) : null,
  ]);
  const byPeriod = productsPeriod ?? productsMonth;
  const unlisted = [...productsMonth, ...byPeriod].filter((x) => x.n && !products.some((pr) => pr.id === String(x._id)));
  if (unlisted.length) {
    const names = await productNames();
    const seen = new Set<string>();
    for (const x of unlisted) {
      const id = String(x._id);
      if (seen.has(id)) continue;
      seen.add(id);
      products.push({ id, name: names.get(id) ?? "Unknown product" });
    }
  }

  const names = await userNames(perOwner.map((o) => o._id));
  const overdueMap = new Map(overduePerAssignee.map((o) => [String(o._id), o.n]));
  const owners = perOwner
    .map((o) => ({
      id: String(o._id),
      name: names.get(String(o._id)) ?? "Unknown",
      open: o.open,
      overdue: overdueMap.get(String(o._id)) ?? 0,
      convertedMonth: o.convertedMonth,
      converted: o.converted,
    }))
    .sort((a, b) => b.converted - a.converted || b.open - a.open);

  const activeProjects = visibleProjects.filter((pr) => pr.status === "ACTIVE" && (!project || pr._id.equals(project)));
  const [stats, projectConverted] = await Promise.all([
    projectStats(
      activeProjects.map((pr) => pr._id),
      at,
    ),
    Lead.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { ...base, projectId: { $in: activeProjects.map((pr) => pr._id) }, convertedAt: inPeriod } },
      { $group: { _id: "$projectId", n: { $sum: 1 } } },
    ]),
  ]);
  const convertedIn = new Map(projectConverted.map((x) => [String(x._id), x.n]));
  const projects = activeProjects
    .map((pr) => ({
      id: String(pr._id),
      name: pr.name,
      open: stats.open.get(String(pr._id)) ?? 0,
      convertedMonth: stats.converted.get(String(pr._id)) ?? 0,
      converted: convertedIn.get(String(pr._id)) ?? 0,
      overdue: stats.overdue.get(String(pr._id)) ?? 0,
      targetConversions: pr.targetConversions ?? null,
    }))
    .sort((a, b) => b.open - a.open);

  const stageCounts = Object.fromEntries(byStage.map((s) => [s._id, s.n]));
  const openLeads = OPEN_LEAD_STAGES.reduce((n, s) => n + (stageCounts[s] ?? 0), 0);
  const hours = responses.map((l) => (l.firstContactedAt!.getTime() - l.createdAt.getTime()) / 3_600_000).filter((h) => h >= 0);
  const med = median(hours);
  return {
    scopeAll: scope.all,
    slaHours: cfg.followUpSlaHours,
    byStage: stageCounts,
    openLeads,
    newToday,
    newWeek,
    uncontactedOverSla: uncontacted,
    overdueTasks,
    dueToday,
    convertedMonth,
    lostMonth,
    winRate90d: converted90 + lost90 ? Math.round((converted90 / (converted90 + lost90)) * 100) : null,
    medianResponseHours: med == null ? null : Math.round(med * 10) / 10,
    bySource: bySource.map((s) => ({ source: s._id, leads: s.leads, contacted: s.contacted, converted: s.converted, paid: s.paid })),
    period: {
      ...periodDays,
      newLeads: periodNew,
      converted: periodConverted,
      lost: periodLost,
      winRate: periodConverted + periodLost ? Math.round((periodConverted / (periodConverted + periodLost)) * 100) : null,
    },
    projects,
    owners,
    byProduct: products.map((pr) => ({
      ...pr,
      month: productsMonth.find((x) => String(x._id) === pr.id)?.n ?? 0,
      count: byPeriod.find((x) => String(x._id) === pr.id)?.n ?? 0,
    })),
    myTasks: await tasksToDtos(myTasks as never),
  };
}
