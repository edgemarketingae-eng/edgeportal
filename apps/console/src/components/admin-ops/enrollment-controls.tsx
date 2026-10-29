"use client";

import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@edge/ui/components/dropdown-menu";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Select } from "@edge/ui/components/select";
import { SegmentedControl } from "@edge/ui/forms/segmented-control";
import { Field } from "@edge/ui/forms/field";
import {
  approveAction,
  assignBatchAction,
  changeBatchAction,
  extendDueAction,
  lockAction,
  rejectAction,
  unlockAction,
} from "@/app/admin/enrollment-actions";
import { CalendarClock, Ellipsis, Lock, Shuffle } from "lucide-react";
import { useState } from "react";
import { manualPaymentAction } from "@/app/admin/students/[id]/actions";

export interface ControlsProps {
  studentId: string;
  enrollment: { id: string; status: string; paymentState: string; balanceDueOn: string | null; batchId: string } | null;
  batches: { id: string; label: string }[];
  can: { approve: boolean; lock: boolean; editTerms: boolean; assignBatch: boolean; recordManual: boolean };
}

export function EnrollmentControls({ studentId, enrollment: e, batches, can }: ControlsProps) {
  if (!e) {
    return can.assignBatch ? (
      <ActionDialog
        action={assignBatchAction}
        hidden={{ studentId }}
        title="Assign to a batch"
        trigger={<Button size="sm">Assign to batch</Button>}
        submitLabel="Assign"
      >
        <BatchSelect batches={batches} />
      </ActionDialog>
    ) : null;
  }
  return <Controls studentId={studentId} e={e} batches={batches} can={can} />;
}

/** The dialogs opened from the "More" menu. */
type MoreDialog = "lock" | "due" | "batch";

function Controls({ studentId, e, batches, can }: Omit<ControlsProps, "enrollment"> & { e: NonNullable<ControlsProps["enrollment"]> }) {
  const [dialog, setDialog] = useState<MoreDialog | null>(null);
  const controlled = (d: MoreDialog) => ({ open: dialog === d, onOpenChange: (o: boolean) => setDialog(o ? d : null) });
  const hid = { enrollmentId: e.id };
  const partly = e.paymentState === "PARTIALLY_PAID";
  const show = {
    lock: can.lock && e.status === "ACTIVE",
    due: can.editTerms && partly,
    batch: can.assignBatch && !["REJECTED", "CANCELLED"].includes(e.status),
  };
  return (
    <div className="flex flex-wrap gap-2">
      {can.approve && e.status === "PENDING_APPROVAL" ? (
        <>
          <ActionButton action={approveAction} hidden={hid}>
            Approve
          </ActionButton>
          <ActionDialog
            action={rejectAction}
            hidden={hid}
            title="Reject registration"
            description="The student is emailed this reason. Fees are non-refundable; handle any refund outside the portal."
            trigger={
              <Button size="sm" variant="outline">
                Reject
              </Button>
            }
            submitLabel="Reject"
            destructive
          >
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" name="reason" required rows={3} />
          </ActionDialog>
        </>
      ) : null}
      {show.lock ? (
        <ActionDialog
          {...controlled("lock")}
          action={lockAction}
          hidden={hid}
          title="Lock access"
          description="The student loses access to classes and recordings until unlocked."
          submitLabel="Lock"
          destructive
        >
          <Label htmlFor="note">Note shown to the student (optional)</Label>
          <Textarea id="note" name="note" rows={2} />
        </ActionDialog>
      ) : null}
      {can.lock && e.status === "LOCKED" ? (
        <ActionDialog
          action={unlockAction}
          hidden={hid}
          title="Unlock access"
          description={partly ? "If the balance is overdue, set a new due date." : undefined}
          trigger={<Button size="sm">Unlock</Button>}
          submitLabel="Unlock"
        >
          {partly ? (
            <Field label="New balance due date" name="newDueDate" type="date" />
          ) : (
            <p className="text-muted-foreground text-sm">Access will be restored immediately.</p>
          )}
        </ActionDialog>
      ) : null}
      {show.due ? (
        <ActionDialog {...controlled("due")} action={extendDueAction} hidden={hid} title="Change balance due date" submitLabel="Save">
          <Field label="New due date" name="newDueDate" type="date" defaultValue={e.balanceDueOn ?? undefined} required />
        </ActionDialog>
      ) : null}
      {show.batch ? (
        <ActionDialog {...controlled("batch")} action={changeBatchAction} hidden={hid} title="Move to another batch" submitLabel="Move">
          <BatchSelect batches={batches.filter((b) => b.id !== e.batchId)} />
        </ActionDialog>
      ) : null}
      {can.recordManual && e.paymentState !== "PAID" && ["PENDING_PAYMENT", "PENDING_APPROVAL", "ACTIVE", "LOCKED"].includes(e.status) ? (
        <ActionDialog
          action={manualPaymentAction}
          hidden={{ studentId }}
          title="Record bank transfer or cash"
          description="Creates a paid receipt and syncs it to Odoo. No processing fee applies."
          trigger={
            <Button size="sm" variant="outline">
              Record payment
            </Button>
          }
          submitLabel="Record payment"
        >
          {e.paymentState === "UNPAID" ? (
            <SegmentedControl
              name="kind"
              label="Type"
              defaultValue="FULL"
              options={[
                { value: "FULL", label: "Full payment" },
                { value: "ADVANCE", label: "Advance" },
              ]}
            />
          ) : (
            <div className="grid content-start gap-2">
              <Label>Type</Label>
              <input type="hidden" name="kind" value="BALANCE" />
              <p className="text-sm font-medium">Remaining balance</p>
            </div>
          )}
          {e.paymentState === "UNPAID" ? (
            <Field label="Advance amount (AED, ex VAT, only for advance)" name="amount" inputMode="decimal" />
          ) : null}
          <SegmentedControl
            name="method"
            label="Method"
            defaultValue="BANK_TRANSFER"
            options={[
              { value: "BANK_TRANSFER", label: "Bank transfer" },
              { value: "CASH", label: "Cash" },
              { value: "OTHER", label: "Other" },
            ]}
          />
          <Field label="Reference" name="reference" required />
          <Field label="Notes" name="notes" />
        </ActionDialog>
      ) : null}
      {show.lock || show.due || show.batch ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Ellipsis /> More
            </Button>
          </DropdownMenuTrigger>
          {/* Its dialogs sit above, outside the menu, which closes (and unmounts) as one opens. */}
          <DropdownMenuContent align="end" className="w-52">
            {show.due ? (
              <DropdownMenuItem onSelect={() => setDialog("due")}>
                <CalendarClock /> Change due date…
              </DropdownMenuItem>
            ) : null}
            {show.batch ? (
              <DropdownMenuItem onSelect={() => setDialog("batch")}>
                <Shuffle /> Change batch…
              </DropdownMenuItem>
            ) : null}
            {show.lock ? (
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog("lock")}>
                <Lock /> Lock access…
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function BatchSelect({ batches }: { batches: { id: string; label: string }[] }) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor="batchId">Batch</Label>
      <Select id="batchId" name="batchId" defaultValue="" required>
        <option value="" disabled>
          Choose a batch
        </option>
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
