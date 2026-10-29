"use client";

import type { CrmOptions, LeadDto } from "@edge/contracts";
import { LEAD_STAGES } from "@edge/domain/crm/enums";
import { LEAD_STAGE_LABELS } from "@edge/domain/crm/labels";
import { nextStage, whatsappDigits } from "@edge/domain/crm/machine";
import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@edge/ui/components/dropdown-menu";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Input } from "@edge/ui/components/input";
import { Select } from "@edge/ui/components/select";
import {
  ArrowRight,
  Ellipsis,
  FolderInput,
  GitMerge,
  Hand,
  Mail,
  MailCheck,
  MessageCircle,
  Phone,
  Trash2,
  UserRoundCog,
} from "lucide-react";
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
        <Select id="stage" name="stage" value={stage} onChange={(e) => setStage(e.target.value)}>
          {choices.map((s) => (
            <option key={s} value={s}>
              {LEAD_STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      {stage === "LOST" ? (
        <div className="grid content-start gap-2">
          <Label htmlFor="lostReason">Reason</Label>
          <Select id="lostReason" name="lostReason" defaultValue="" required>
            <option value="" disabled>
              Choose a reason
            </option>
            {lostReasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div className="grid content-start gap-2">
        <Label htmlFor="stage-note">Note (optional)</Label>
        <Textarea id="stage-note" name="note" rows={2} />
      </div>
    </>
  );
}

/** The dialogs opened from the "More" menu. */
type MoreDialog = "assign" | "move" | "resend" | "merge" | "delete";

export function LeadControls({ lead, options, matchingStudent, duplicates, can }: LeadControlsProps) {
  const [dialog, setDialog] = useState<MoreDialog | null>(null);
  const hid = { id: lead.id };
  const first = lead.name.split(/\s+/)[0] ?? lead.name;
  const waText = encodeURIComponent(
    `Hi ${first}, this is Edge Trading Academy. Thanks for your interest in our trading program. When is a good time to talk?`,
  );
  const open = lead.stage !== "CONVERTED" && !lead.mergedIntoId;
  const next = nextStage(lead.stage);
  const team = options.teams[lead.project.id] ?? [];
  // Any active project the viewer is part of (the options list only has those).
  const otherProjects = options.projects.filter((p) => p.id !== lead.project.id);
  const live = !lead.mergedIntoId;
  const show = {
    assign: can.assign && live,
    move: can.moveProject && otherProjects.length > 0 && live,
    resend: can.convert && !!lead.studentId,
    merge: can.manage && duplicates.length > 0 && live,
    delete: can.delete && !lead.studentId,
  };
  /** Opens and closes one of the menu's dialogs. */
  const controlled = (d: MoreDialog) => ({ open: dialog === d, onOpenChange: (o: boolean) => setDialog(o ? d : null) });
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
      {can.convert && live && !lead.studentId && !matchingStudent ? (
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
            <Select id="batchId" name="batchId" defaultValue="">
              <option value="">No batch yet (placed in the current batch after phone verification)</option>
              {options.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="sendSetPassword" defaultChecked /> Email the set-password link now
          </label>
        </ActionDialog>
      ) : null}
      {can.convert && live && !lead.studentId && matchingStudent ? (
        <ActionDialog
          action={linkStudentAction}
          hidden={{ ...hid, studentId: matchingStudent.id }}
          title="Link to existing student"
          description={`${matchingStudent.name} (${matchingStudent.email}) already has a portal account with this mobile or email. Linking marks the lead as converted.`}
          trigger={<Button size="sm">Link to student</Button>}
          submitLabel="Link"
        />
      ) : null}

      {Object.values(show).some(Boolean) ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Ellipsis /> More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {show.assign ? (
              <DropdownMenuItem onSelect={() => setDialog("assign")}>
                <UserRoundCog /> Assign…
              </DropdownMenuItem>
            ) : null}
            {show.move ? (
              <DropdownMenuItem onSelect={() => setDialog("move")}>
                <FolderInput /> Move to project…
              </DropdownMenuItem>
            ) : null}
            {show.resend ? (
              <DropdownMenuItem onSelect={() => setDialog("resend")}>
                <MailCheck /> Resend set-password email…
              </DropdownMenuItem>
            ) : null}
            {show.merge ? (
              <DropdownMenuItem onSelect={() => setDialog("merge")}>
                <GitMerge /> Merge duplicate…
              </DropdownMenuItem>
            ) : null}
            {show.delete ? (
              <>
                {show.assign || show.move || show.resend || show.merge ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                  <Trash2 /> Delete lead…
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {/* The menu's dialogs live outside it: the menu closes (and unmounts) as one opens. */}
      {show.assign ? (
        <ActionDialog
          {...controlled("assign")}
          action={assignAction}
          hidden={hid}
          title="Assign lead"
          description={`Team of ${lead.project.name}.`}
          submitLabel="Assign"
        >
          <div className="grid content-start gap-2">
            <Label htmlFor="ownerId">Owner</Label>
            <Select id="ownerId" name="ownerId" defaultValue={lead.ownerId ?? ""}>
              <option value="">Unassigned (pool)</option>
              {team.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.available === false ? " (Off)" : ""}
                </option>
              ))}
            </Select>
          </div>
        </ActionDialog>
      ) : null}
      {show.move ? (
        <ActionDialog
          {...controlled("move")}
          action={moveProjectAction}
          hidden={hid}
          title="Move to another project"
          description="Choose one of your projects. Open tasks move along. The owner stays only if they are on the new project's team."
          submitLabel="Move"
        >
          <div className="grid content-start gap-2">
            <Label htmlFor="move-project">Project</Label>
            <Select id="move-project" name="projectId" defaultValue="" required>
              <option value="" disabled>
                Choose a project
              </option>
              {otherProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </ActionDialog>
      ) : null}
      {show.resend ? (
        <ActionDialog
          {...controlled("resend")}
          action={resendWelcomeAction}
          hidden={hid}
          title="Resend the set-password email?"
          description="The student gets the email with a link to set their portal password again."
          submitLabel="Send email"
        />
      ) : null}
      {show.merge ? (
        <ActionDialog
          {...controlled("merge")}
          action={mergeAction}
          hidden={hid}
          title="Merge a duplicate into this lead"
          description="The duplicate's notes, tags, tasks and history move here; the duplicate is hidden afterwards."
          submitLabel="Merge"
          destructive
        >
          <div className="grid content-start gap-2">
            <Label htmlFor="fromId">Duplicate</Label>
            <Select id="fromId" name="fromId" defaultValue="" required>
              <option value="" disabled>
                Choose the duplicate
              </option>
              {duplicates.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.phone ?? d.email}
                </option>
              ))}
            </Select>
          </div>
        </ActionDialog>
      ) : null}
      {show.delete ? (
        <ActionDialog
          {...controlled("delete")}
          action={deleteLeadAction}
          hidden={hid}
          title={`Delete ${lead.name}?`}
          description="The lead, its activity history, its tasks and any duplicates merged into it are removed for good. This can't be undone."
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
