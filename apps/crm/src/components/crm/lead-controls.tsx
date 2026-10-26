"use client";

import type { CrmOptions, LeadDto } from "@edge/contracts";
import { LEAD_STAGES } from "@edge/domain/crm/enums";
import { LEAD_STAGE_LABELS } from "@edge/domain/crm/labels";
import { nextStage, whatsappDigits } from "@edge/domain/crm/machine";
import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Input } from "@edge/ui/components/input";
import { NativeSelect } from "@edge/ui/components/native-select";
import { ArrowRight, Hand, Mail, MessageCircle, Phone, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  assignAction,
  claimAction,
  convertAction,
  deleteLeadAction,
  linkStudentAction,
  mergeAction,
  moveProjectAction,
  resendWelcomeAction,
  setStageAction,
} from "@/lib/actions/leads";

export interface LeadControlsProps {
  lead: Pick<LeadDto, "id" | "name" | "phone" | "email" | "stage" | "ownerId" | "studentId" | "mergedIntoId" | "project">;
  options: CrmOptions;
  matchingStudent: { id: string; name: string; email: string } | null;
  duplicates: { id: string; name: string; phone: string | null; email: string | null }[];
  can: { write: boolean; assign: boolean; claim: boolean; moveProject: boolean; convert: boolean; manage: boolean; delete: boolean };
}

function StageFields({ current, lostReasons }: { current: string; lostReasons: string[] }) {
  const choices = LEAD_STAGES.filter((s) => s !== "CONVERTED" && s !== current);
  const [stage, setStage] = useState<string>(choices[0] ?? "LOST");
  return (
    <>
      <div className="grid content-start gap-2">
        <Label htmlFor="stage">New stage</Label>
        <NativeSelect id="stage" name="stage" value={stage} onChange={(e) => setStage(e.target.value)}>
          {choices.map((s) => (
            <option key={s} value={s}>
              {LEAD_STAGE_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {stage === "LOST" ? (
        <div className="grid content-start gap-2">
          <Label htmlFor="lostReason">Reason</Label>
          <NativeSelect id="lostReason" name="lostReason" required>
            {lostReasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      <div className="grid content-start gap-2">
        <Label htmlFor="stage-note">Note (optional)</Label>
        <Textarea id="stage-note" name="note" rows={2} />
      </div>
    </>
  );
}

export function LeadControls({ lead, options, matchingStudent, duplicates, can }: LeadControlsProps) {
  const hid = { id: lead.id };
  const first = lead.name.split(/\s+/)[0] ?? lead.name;
  const waText = encodeURIComponent(
    `Hi ${first}, this is Edge Trading Academy. Thanks for your interest in our trading program. When is a good time to talk?`,
  );
  const open = lead.stage !== "CONVERTED" && !lead.mergedIntoId;
  const next = nextStage(lead.stage);
  const team = options.teams[lead.project.id] ?? [];
  const otherProjects = options.projects.filter((p) => p.id !== lead.project.id && p.canAssign);
  return (
    <div className="flex flex-wrap gap-2">
      {lead.phone ? (
        <>
          <Button asChild size="sm" variant="outline">
            <a href={`https://wa.me/${whatsappDigits(lead.phone)}?text=${waText}`} target="_blank" rel="noreferrer">
              <MessageCircle /> WhatsApp
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={`tel:${lead.phone}`}>
              <Phone /> Call
            </a>
          </Button>
        </>
      ) : null}
      {lead.email ? (
        <Button asChild size="sm" variant="outline">
          <a href={`mailto:${lead.email}`}>
            <Mail /> Email
          </a>
        </Button>
      ) : null}
      {can.claim ? (
        <ActionButton action={claimAction} hidden={hid}>
          <>
            <Hand /> Claim this lead
          </>
        </ActionButton>
      ) : null}
      {can.write && open && next ? (
        <ActionButton action={setStageAction} hidden={{ ...hid, stage: next }} variant="outline">
          <>
            <ArrowRight /> {LEAD_STAGE_LABELS[next]}
          </>
        </ActionButton>
      ) : null}
      {can.write && open ? (
        <ActionDialog
          action={setStageAction}
          hidden={hid}
          title="Change stage"
          trigger={
            <Button size="sm" variant="outline">
              Stage…
            </Button>
          }
          submitLabel="Move"
        >
          <StageFields current={lead.stage} lostReasons={options.lostReasons} />
        </ActionDialog>
      ) : null}
      {can.assign && !lead.mergedIntoId ? (
        <ActionDialog
          action={assignAction}
          hidden={hid}
          title="Assign lead"
          description={`Team of ${lead.project.name}.`}
          trigger={
            <Button size="sm" variant="outline">
              Assign
            </Button>
          }
          submitLabel="Assign"
        >
          <div className="grid content-start gap-2">
            <Label htmlFor="ownerId">Owner</Label>
            <NativeSelect id="ownerId" name="ownerId" defaultValue={lead.ownerId ?? ""}>
              <option value="">Unassigned (pool)</option>
              {team.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.available === false ? " (Off)" : ""}
                </option>
              ))}
            </NativeSelect>
          </div>
        </ActionDialog>
      ) : null}
      {can.moveProject && otherProjects.length && !lead.mergedIntoId ? (
        <ActionDialog
          action={moveProjectAction}
          hidden={hid}
          title="Move to another project"
          description="Open tasks move along. The owner stays only if they are on the new project's team."
          trigger={
            <Button size="sm" variant="outline">
              Move project
            </Button>
          }
          submitLabel="Move"
        >
          <div className="grid content-start gap-2">
            <Label htmlFor="move-project">Project</Label>
            <NativeSelect id="move-project" name="projectId">
              {otherProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </ActionDialog>
      ) : null}
      {can.convert && open && !lead.studentId && !matchingStudent ? (
        <ActionDialog
          action={convertAction}
          hidden={hid}
          title="Convert to student"
          description="Creates the student portal account with this lead's name, email and mobile. The student sets their own password from the email and verifies their mobile at first sign-in."
          trigger={<Button size="sm">Convert to student</Button>}
          submitLabel="Create student account"
        >
          <div className="grid content-start gap-2">
            <Label htmlFor="batchId">Enroll in batch</Label>
            <NativeSelect id="batchId" name="batchId" defaultValue="">
              <option value="">No batch yet (placed in the current batch after phone verification)</option>
              {options.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="sendSetPassword" defaultChecked /> Email the set-password link now
          </label>
        </ActionDialog>
      ) : null}
      {can.convert && open && !lead.studentId && matchingStudent ? (
        <ActionDialog
          action={linkStudentAction}
          hidden={{ ...hid, studentId: matchingStudent.id }}
          title="Link to existing student"
          description={`${matchingStudent.name} (${matchingStudent.email}) already has a portal account with this mobile or email. Linking marks the lead as converted.`}
          trigger={<Button size="sm">Link to student</Button>}
          submitLabel="Link"
        />
      ) : null}
      {can.convert && lead.studentId ? (
        <ActionButton action={resendWelcomeAction} hidden={hid} variant="outline">
          Resend set-password email
        </ActionButton>
      ) : null}
      {can.manage && duplicates.length && !lead.mergedIntoId ? (
        <ActionDialog
          action={mergeAction}
          hidden={hid}
          title="Merge a duplicate into this lead"
          description="The duplicate's notes, tags, tasks and history move here; the duplicate is hidden afterwards."
          trigger={
            <Button size="sm" variant="outline">
              Merge duplicate
            </Button>
          }
          submitLabel="Merge"
          destructive
        >
          <div className="grid content-start gap-2">
            <Label htmlFor="fromId">Duplicate</Label>
            <NativeSelect id="fromId" name="fromId">
              {duplicates.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.phone ?? d.email}
                </option>
              ))}
            </NativeSelect>
          </div>
        </ActionDialog>
      ) : null}
      {can.delete && !lead.studentId ? (
        <ActionDialog
          action={deleteLeadAction}
          hidden={hid}
          title={`Delete ${lead.name}?`}
          description="The lead, its activity history, its tasks and any duplicates merged into it are removed for good. This can't be undone."
          trigger={
            <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 /> Delete
            </Button>
          }
          submitLabel="Delete lead"
          destructive
        >
          <ConfirmDelete />
        </ActionDialog>
      ) : null}
    </div>
  );
}

export function ConfirmDelete() {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor="confirm-delete">
        Type <span className="font-mono font-semibold">DELETE</span> to confirm
      </Label>
      <Input id="confirm-delete" name="confirm" autoComplete="off" required />
    </div>
  );
}
