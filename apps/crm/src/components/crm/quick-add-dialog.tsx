"use client";

import type { CrmOptions } from "@edge/contracts";
import { LEAD_SOURCES } from "@edge/domain/crm/enums";
import { LEAD_SOURCE_LABELS } from "@edge/domain/crm/labels";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Field } from "@edge/ui/forms/field";
import { Plus } from "lucide-react";
import { useState } from "react";
import { quickAddLeadAction } from "@/lib/actions/leads";

const select = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

/** Project picker plus the owner list for that project (only when the viewer may assign there). */
export function ProjectOwnerFields({ options, meId, defaultProjectId }: { options: CrmOptions; meId: string; defaultProjectId?: string }) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? options.projects.find((p) => p.isDefault)?.id ?? options.projects[0]?.id ?? "");
  const project = options.projects.find((p) => p.id === projectId);
  const team = options.teams[projectId] ?? [];
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="qa-project">Project</Label>
        <select id="qa-project" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={select} required>
          {options.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {project?.canAssign && team.length > 1 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="qa-owner">Owner</Label>
          <select id="qa-owner" name="ownerId" className={select} defaultValue={team.some((t) => t.id === meId) ? meId : ""}>
            <option value="">Unassigned (pool)</option>
            {team.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );
}

export function QuickAddLead({ options, meId }: { options: CrmOptions; meId: string }) {
  if (!options.projects.length) return null;
  return (
    <ActionDialog
      action={quickAddLeadAction}
      hidden={{}}
      title="Quick add lead"
      description="A name plus a mobile number or email is enough. Fill in the rest from the lead page."
      trigger={
        <Button size="sm">
          <Plus /> Quick add
        </Button>
      }
      submitLabel="Add lead"
    >
      <Field label="Name" name="name" required autoFocus />
      <Field label="Mobile (WhatsApp)" name="phone" inputMode="tel" placeholder="+971 50 123 4567" />
      <Field label="Email" name="email" type="email" />
      <div className="grid gap-1.5">
        <Label htmlFor="qa-source">Source</Label>
        <select id="qa-source" name="source" className={select} defaultValue="INSTAGRAM">
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <ProjectOwnerFields options={options} meId={meId} />
      <Field label="Next follow-up (optional)" name="nextFollowUpAt" type="datetime-local" />
      <div className="grid gap-1.5">
        <Label htmlFor="qa-notes">Notes</Label>
        <Textarea id="qa-notes" name="notes" rows={2} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="allowDuplicate" /> Create even if a lead with this contact already exists
      </label>
    </ActionDialog>
  );
}
