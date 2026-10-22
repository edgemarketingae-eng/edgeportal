import { z } from "zod";
import { zEmail, zOk } from "./common";
import { route } from "./route";

export const StaffRow = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  title: z.string().nullable(),
  workspaceEmail: z.string().nullable(),
  roles: z.array(z.object({ key: z.string(), name: z.string() })),
  disabled: z.boolean(),
  invited: z.boolean(),
  lastSignInAt: z.string().nullable(),
});
export type StaffRow = z.infer<typeof StaffRow>;

export const RoleDto = z.object({ id: z.string(), key: z.string(), name: z.string(), description: z.string().nullable(), permissions: z.array(z.string()), isSystem: z.boolean(), members: z.number() });
export type RoleDto = z.infer<typeof RoleDto>;

const optionalEmail = z.union([z.literal(""), zEmail("Enter a valid Google Workspace email")]).optional();

export const StaffCreateInput = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  email: zEmail(),
  title: z.string().trim().optional(),
  workspaceEmail: optionalEmail,
  roleKeys: z.array(z.string()).min(1, "Choose at least one role"),
});
export const StaffUpdateInput = StaffCreateInput.omit({ email: true });

const idParam = z.object({ id: z.string() });

export const staffRoutes = {
  list: route({ method: "GET", path: "/api/v1/admin/staff", response: z.array(StaffRow) }),
  get: route({ method: "GET", path: "/api/v1/admin/staff/:id", params: idParam, response: StaffRow }),
  create: route({ method: "POST", path: "/api/v1/admin/staff", body: StaffCreateInput, response: z.object({ id: z.string(), tempPassword: z.string().optional() }) }),
  update: route({ method: "POST", path: "/api/v1/admin/staff/:id", params: idParam, body: StaffUpdateInput, response: zOk }),
  setDisabled: route({ method: "POST", path: "/api/v1/admin/staff/:id/disabled", params: idParam, body: z.object({ disabled: z.boolean() }), response: zOk }),
  resetPassword: route({ method: "POST", path: "/api/v1/admin/staff/:id/reset-password", params: idParam, response: z.object({ ok: z.literal(true), tempPassword: z.string() }) }),
  roles: route({ method: "GET", path: "/api/v1/admin/roles", response: z.array(RoleDto) }),
  saveRole: route({
    method: "POST",
    path: "/api/v1/admin/roles",
    body: z.object({ id: z.string().optional(), name: z.string().trim().min(2, "Enter a role name"), description: z.string().optional(), permissions: z.array(z.string()) }),
    response: z.object({ id: z.string() }),
  }),
};
