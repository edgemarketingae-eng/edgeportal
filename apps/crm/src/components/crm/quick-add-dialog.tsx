"use client";

import type { CrmOptions } from "@edge/contracts";
import { LEAD_SOURCES, ROUND_ROBIN } from "@edge/domain/crm/enums";
import { LEAD_SOURCE_LABELS } from "@edge/domain/crm/labels";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { NativeSelect } from "@edge/ui/components/native-select";
import { Field } from "@edge/ui/forms/field";
import { Plus } from "lucide-react";
import { useState } from "react";
import { quickAddLeadAction } from "@/lib/actions/leads";

/** Project picker plus the owner list for that project (only when the viewer may assign there). `roundRobin` offers spreading leads across the project's sales executives. */
export function ProjectOwnerFields({
  options,
  meId,
  defaultProjectId,
  defaultOwnerId,
  roundRobin,
}: {
  options: CrmOptions;
  meId: string;
  defaultProjectId?: string;
  defaultOwnerId?: string;
  roundRobin?: boolean;
}) {
  const [projectId, setProjectId] = useState(
    defaultProjectId ?? options.projects.find((p) => p.isDefault)?.id ?? options.projects[0]?.id ?? "",
  );
  const project = options.projects.find((p) => p.id === projectId);
  const team = options.teams[projectId] ?? [];
  return (
    <>
      <div className="grid content-start gap-2">
        <Label htmlFor="qa-project">Project</Label>
        <NativeSelect id="qa-project" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
          {options.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {project?.canAssign && (team.length > 1 || roundRobin) ? (
        <div className="grid content-start gap-2">
          <Label htmlFor="qa-owner">Owner</Label>
          <NativeSelect
            key={projectId}
            id="qa-owner"
            name="ownerId"
            defaultValue={defaultOwnerId ?? (team.some((t) => t.id === meId) ? meId : "")}
          >
            <option value="">Unassigned (pool)</option>
            {roundRobin ? <option value={ROUND_ROBIN}>Round-robin to the project&apos;s sales executives</option> : null}
            {team.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.available === false ? " (Off)" : ""}
              </option>
            ))}
          </NativeSelect>
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
      size="lg"
      bodyClassName="sm:grid-cols-2 [&>[role=alert]]:col-span-full"
    >
      <Field label="Name" name="name" required autoFocus className="sm:col-span-2" />
      <Field label="Mobile (WhatsApp)" name="phone" type="tel" />
      <Field label="Email" name="email" type="email" />
      <div className="grid content-start gap-2">
        <Label htmlFor="qa-source">Source</Label>
        <NativeSelect id="qa-source" name="source" defaultValue="INSTAGRAM">
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <ProjectOwnerFields options={options} meId={meId} />
      <Field label="Next follow-up (optional)" name="nextFollowUpAt" type="datetime-local" />
      <div className="grid content-start gap-2 sm:col-span-2">
        <Label htmlFor="qa-notes">Notes</Label>
        <Textarea id="qa-notes" name="notes" rows={3} />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Checkbox name="allowDuplicate" /> Create even if a lead with this contact already exists
      </label>
    </ActionDialog>
  );
}
