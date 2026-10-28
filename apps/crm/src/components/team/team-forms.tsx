"use client";

import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { NativeSelect } from "@edge/ui/components/native-select";
import { Field, FormError, FormMessage, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { createCrmStaffAction, resetCrmStaffPasswordAction, saveCrmRoleAction, updateCrmStaffAction } from "@/lib/actions/team";

export interface RoleOption {
  key: string;
  name: string;
  description: string | null;
}

/**
 * Where landing page leads chat with this person, and the phone / Telegram username for it. Sales teams move a
 * person to Telegram when their WhatsApp number is at risk of a ban from too many new chats.
 */
function ContactFields({ channel, phone, telegram }: { channel?: string; phone?: string; telegram?: string }) {
  return (
    <>
      <div className="grid content-start gap-2">
        <Label htmlFor="contactChannel">Chat with leads on</Label>
        <NativeSelect id="contactChannel" name="contactChannel" defaultValue={channel || "WHATSAPP"}>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="TELEGRAM">Telegram</option>
        </NativeSelect>
        <p className="text-muted-foreground text-xs">Landing page and Growth Hub visitors are sent to this app.</p>
      </div>
      <Field label="Phone (WhatsApp)" name="phone" type="tel" defaultValue={phone} hint="Needed when chatting on WhatsApp." />
      <Field label="Telegram username" name="telegramUsername" defaultValue={telegram} placeholder="@username" hint="Needed when chatting on Telegram." />
    </>
  );
}

/** React resets a form after every action; remounting with the submitted values keeps them after an error. */
const formKey = (state: ActionState) => JSON.stringify(state.values ?? {});
const list = (s: string | undefined) => (s ? s.split(",") : []);

function RoleChecks({ roles, selected }: { roles: RoleOption[]; selected: string[] }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">CRM roles</legend>
      {roles.map((r) => (
        <div key={r.key} className="flex items-start gap-2">
          <Checkbox id={`role-${r.key}`} name="roleKeys" value={r.key} defaultChecked={selected.includes(r.key)} className="mt-0.5" />
          <Label htmlFor={`role-${r.key}`} className="leading-snug font-normal">
            <b>{r.name}</b>
            {r.description ? <span className="text-muted-foreground block text-xs">{r.description}</span> : null}
          </Label>
        </div>
      ))}
    </fieldset>
  );
}

export function CreateCrmStaffForm({ roles, projects }: { roles: RoleOption[]; projects: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createCrmStaffAction, {} as ActionState);
  const v = state.values;
  return (
    <form key={formKey(state)} action={action} className="grid gap-4">
      <FormMessage state={state} />
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="name" defaultValue={v?.name} required />
        <Field label="Login email" name="email" type="email" defaultValue={v?.email} required />
        <Field label="Job title" name="title" defaultValue={v?.title} />
        <Field label="Google Workspace email" name="workspaceEmail" type="email" defaultValue={v?.workspaceEmail} hint="Only needed for Meet consultations later." />
        <ContactFields channel={v?.contactChannel} phone={v?.phone} telegram={v?.telegramUsername} />
      </div>
      <RoleChecks roles={roles} selected={list(v?.roleKeys)} />
      {projects.length ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Add to projects (as sales executive)</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <Checkbox id={`proj-${p.id}`} name="projectIds" value={p.id} defaultChecked={list(v?.projectIds).includes(p.id)} />
                <Label htmlFor={`proj-${p.id}`} className="font-normal">
                  {p.name}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      <Button className="w-fit" disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}

export function EditCrmStaffForm({
  user,
  roles,
}: {
  user: { id: string; name: string; title: string; workspaceEmail: string; phone: string; telegramUsername: string; contactChannel: string; roleKeys: string[] };
  roles: RoleOption[];
}) {
  const [state, action, pending] = useActionState(updateCrmStaffAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
  }, [state]);
  const v = state.values;
  return (
    <form key={formKey(state)} action={action} className="grid gap-4">
      <input type="hidden" name="userId" value={user.id} />
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="name" defaultValue={v?.name ?? user.name} required />
        <Field label="Job title" name="title" defaultValue={v?.title ?? user.title} />
        <Field label="Google Workspace email" name="workspaceEmail" type="email" defaultValue={v?.workspaceEmail ?? user.workspaceEmail} />
        <ContactFields
          channel={v?.contactChannel ?? user.contactChannel}
          phone={v?.phone ?? user.phone}
          telegram={v?.telegramUsername ?? user.telegramUsername}
        />
      </div>
      <RoleChecks roles={roles} selected={v ? list(v.roleKeys) : user.roleKeys} />
      <Button className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

/** The temporary password is shown once, in a toast that stays until dismissed (it is also emailed). */
export function ResetPasswordButton({ userId }: { userId: string }) {
  const [, action, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const result = await resetCrmStaffPasswordAction(prev, form);
    if (result.ok) toast.success(result.message ?? "Done", { duration: Infinity, closeButton: true });
    if (result.error) toast.error(result.error);
    return result;
  }, {} as ActionState);
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Working…" : "Reset password"}
      </Button>
    </form>
  );
}

export function RoleForm({ role, permissions, disabled }: { role?: { id: string; name: string; description: string | null; permissions: string[]; isSystem?: boolean }; permissions: [string, string][]; disabled?: boolean }) {
  const [state, action, pending] = useActionState(saveCrmRoleAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
  }, [state]);
  const id = role?.id ?? "new";
  const v = state.values;
  const selected = v ? list(v.permissions) : (role?.permissions ?? []);
  return (
    <form key={formKey(state)} action={action} className="grid gap-3">
      {role ? <input type="hidden" name="id" value={role.id} /> : null}
      <FormError state={state} />
      <fieldset disabled={disabled} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role name" name="name" id={`name-${id}`} defaultValue={v?.name ?? role?.name} required />
          <Field label="Description" name="description" id={`desc-${id}`} defaultValue={v?.description ?? role?.description ?? ""} />
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {permissions.map(([key, label]) => (
            <div key={key} className="flex items-start gap-2">
              <Checkbox id={`${id}-${key}`} name="permissions" value={key} defaultChecked={selected.includes(key)} className="mt-0.5" />
              <Label htmlFor={`${id}-${key}`} className="text-sm leading-snug font-normal">
                {label}
                <span className="text-muted-foreground block font-mono text-[10px]">{key}</span>
              </Label>
            </div>
          ))}
        </div>
      </fieldset>
      {!disabled ? (
        <Button size="sm" className="w-fit" disabled={pending}>
          {pending ? "Saving…" : role ? "Save role" : "Create role"}
        </Button>
      ) : null}
    </form>
  );
}
