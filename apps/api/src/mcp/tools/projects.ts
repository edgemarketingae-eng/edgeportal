import { crmRoutes } from "@edge/contracts";
import { PROJECT_STATUSES } from "@edge/domain/crm/enums";
import { z } from "zod";
import { clear, defined, defineTool, ref, zDay, zId } from "./kit";
import { leadRow, taskRow } from "./shapes";

const projectId = zId("Project");

export const listProjects = defineTool({
  name: "list_projects",
  title: "List projects",
  description: "The projects this person can see, with their managers, members, products, targets and headline numbers.",
  input: { status: z.enum(PROJECT_STATUSES).optional() },
  routes: [crmRoutes.projects],
  perms: ["crm.read"],
  kind: "read",
  async run({ status }, { call }) {
    const rows = await call(crmRoutes.projects, { query: { status } });
    return rows.map((p) => ({ ...p, managers: p.managers.map(ref), members: p.members.map(ref) }));
  },
});

export const getProject = defineTool({
  name: "get_project",
  title: "Get a project",
  description: "One project: its details, leads by stage, the team with their numbers, recent leads and open tasks.",
  input: { projectId },
  routes: [crmRoutes.project],
  perms: ["crm.read"],
  kind: "read",
  async run({ projectId: id }, { call }) {
    const d = await call(crmRoutes.project, { params: { id } });
    return {
      project: { ...d.project, managers: d.project.managers.map(ref), members: d.project.members.map(ref) },
      leadsByStage: d.byStage,
      team: d.team,
      recentLeads: d.recentLeads.slice(0, 15).map(leadRow),
      openTasks: d.openTasks.slice(0, 25).map(taskRow),
    };
  },
});

const target = z.number().int().min(0).max(1_000_000);
const projectFields = {
  code: z.string().trim().max(30).optional().describe("Short code, e.g. FREE-COURSE-MAL (made from the name when left out)"),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  courseId: zId("Course").optional(),
  batchId: zId("Batch").optional(),
  startDate: zDay.optional(),
  endDate: zDay.optional(),
  targetLeads: target.optional(),
  targetConversions: target.optional(),
  managerIds: z.array(zId("Staff user")).max(100).optional(),
  memberIds: z.array(zId("Staff user")).max(500).optional(),
  productIds: z.array(zId("Product")).max(200).optional().describe("Products it sells (CRM managers only)"),
};

export const createProject = defineTool({
  name: "create_project",
  title: "Create a project",
  description: "Create a project (a sales campaign or team), with its managers and members.",
  input: { name: z.string().trim().min(2).max(120), ...projectFields },
  routes: [crmRoutes.createProject],
  perms: ["crm.projects.manage"],
  kind: "write",
  async run(a, { call }) {
    const { id } = await call(crmRoutes.createProject, { body: defined(a) });
    return { ok: true, projectId: id };
  },
});

export const updateProject = defineTool({
  name: "update_project",
  title: "Update a project",
  description:
    "Change a project this person manages. Send only what changes; null clears the description, course, batch, dates or " +
    "targets. managerIds, memberIds and productIds replace those lists.",
  input: {
    projectId,
    name: z.string().trim().min(2).max(120).optional(),
    code: projectFields.code,
    description: z.string().trim().max(5000).nullable().optional(),
    status: projectFields.status,
    courseId: zId("Course").nullable().optional(),
    batchId: zId("Batch").nullable().optional(),
    startDate: zDay.nullable().optional(),
    endDate: zDay.nullable().optional(),
    targetLeads: target.nullable().optional(),
    targetConversions: target.nullable().optional(),
    managerIds: projectFields.managerIds,
    memberIds: projectFields.memberIds,
    productIds: projectFields.productIds,
  },
  routes: [crmRoutes.updateProject],
  perms: ["crm.write"],
  anyPerm: ["crm.projects.manage", "crm.assign"],
  kind: "write",
  idempotent: true,
  async run({ projectId: id, ...a }, { call }) {
    const body = defined({
      ...a,
      description: clear(a.description),
      courseId: clear(a.courseId),
      batchId: clear(a.batchId),
      startDate: clear(a.startDate),
      endDate: clear(a.endDate),
      targetLeads: clear(a.targetLeads),
      targetConversions: clear(a.targetConversions),
    });
    await call(crmRoutes.updateProject, { params: { id }, body });
    return { ok: true };
  },
});

export const addProjectMember = defineTool({
  name: "add_project_member",
  title: "Add someone to a project",
  description: "Add a person to a project's team as a member or a manager (or change their role there).",
  input: { projectId, userId: zId("Staff user"), role: z.enum(["manager", "member"]) },
  routes: [crmRoutes.projectMember],
  perms: ["crm.write"],
  anyPerm: ["crm.projects.manage", "crm.assign"],
  kind: "write",
  idempotent: true,
  async run({ projectId: id, ...body }, { call }) {
    return call(crmRoutes.projectMember, { params: { id }, body });
  },
});

export const removeProjectMember = defineTool({
  name: "remove_project_member",
  title: "Remove someone from a project",
  description: "Take a person off a project's team.",
  input: { projectId, userId: zId("Staff user") },
  routes: [crmRoutes.removeProjectMember],
  perms: ["crm.write"],
  anyPerm: ["crm.projects.manage", "crm.assign"],
  kind: "destructive",
  async run({ projectId: id, userId }, { call }) {
    return call(crmRoutes.removeProjectMember, { params: { id }, body: { userId } });
  },
});

export const deleteProject = defineTool({
  name: "delete_project",
  title: "Delete a project",
  description: "Delete a project. Only one with no team and no leads left can go; the default project never can. Confirm first.",
  input: { projectId },
  routes: [crmRoutes.deleteProject],
  perms: ["crm.projects.delete"],
  kind: "destructive",
  async run({ projectId: id }, { call }) {
    return call(crmRoutes.deleteProject, { params: { id } });
  },
});
