"use client";

import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
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
import { manualPaymentAction } from "@/app/admin/students/[id]/actions";

export interface ControlsProps {
  studentId: string;
  enrollment: { id: string; status: string; paymentState: string; balanceDueOn: string | null; batchId: string } | null;
  batches: { id: string; label: string }[];
  can: { approve: boolean; lock: boolean; editTerms: boolean; assignBatch: boolean; recordManual: boolean };
}

const select = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

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
  const hid = { enrollmentId: e.id };
  const partly = e.paymentState === "PARTIALLY_PAID";
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
      {can.lock && e.status === "ACTIVE" ? (
        <ActionDialog
          action={lockAction}
          hidden={hid}
          title="Lock access"
          description="The student loses access to classes and recordings until unlocked."
          trigger={
            <Button size="sm" variant="outline">
              Lock access
            </Button>
          }
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
      {can.editTerms && partly ? (
        <ActionDialog
          action={extendDueAction}
          hidden={hid}
          title="Change balance due date"
          trigger={
            <Button size="sm" variant="outline">
              Change due date
            </Button>
          }
          submitLabel="Save"
        >
          <Field label="New due date" name="newDueDate" type="date" defaultValue={e.balanceDueOn ?? undefined} required />
        </ActionDialog>
      ) : null}
      {can.assignBatch && !["REJECTED", "CANCELLED"].includes(e.status) ? (
        <ActionDialog
          action={changeBatchAction}
          hidden={hid}
          title="Move to another batch"
          trigger={
            <Button size="sm" variant="outline">
              Change batch
            </Button>
          }
          submitLabel="Move"
        >
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
          <div className="grid gap-1.5">
            <Label htmlFor="kind">Type</Label>
            <select id="kind" name="kind" className={select} defaultValue={e.paymentState === "UNPAID" ? "FULL" : "BALANCE"}>
              {e.paymentState === "UNPAID" ? (
                <>
                  <option value="FULL">Full payment</option>
                  <option value="ADVANCE">Advance</option>
                </>
              ) : (
                <option value="BALANCE">Remaining balance</option>
              )}
            </select>
          </div>
          {e.paymentState === "UNPAID" ? (
            <Field label="Advance amount (AED, ex VAT, only for advance)" name="amount" inputMode="decimal" />
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="method">Method</Label>
            <select id="method" name="method" className={select}>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CASH">Cash</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <Field label="Reference" name="reference" required />
          <Field label="Notes" name="notes" />
        </ActionDialog>
      ) : null}
    </div>
  );
}

function BatchSelect({ batches }: { batches: { id: string; label: string }[] }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="batchId">Batch</Label>
      <select id="batchId" name="batchId" className={select} required>
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
    </div>
  );
}
