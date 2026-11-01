import type { LeaveBalanceDto } from "@edge/contracts";
import { ALLOWED_FILE_TYPES, FILE_ACCEPT } from "@edge/domain/files";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Select } from "@edge/ui/components/select";
import { Textarea } from "@edge/ui/components/textarea";
import { Field, type ActionState } from "@edge/ui/forms/field";
import { FileInput } from "@edge/ui/forms/file-input";

export function LeaveDialog({
  action,
  types,
  title,
  triggerLabel,
  hidden = {},
  variant,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  types: Pick<LeaveBalanceDto, "typeKey" | "name" | "needsAttachment">[];
  title: string;
  triggerLabel: string;
  hidden?: Record<string, string>;
  variant?: "outline";
}) {
  const needed = types.filter((t) => t.needsAttachment).map((t) => t.name);
  return (
    <ActionDialog
      action={action}
      hidden={hidden}
      size="md"
      title={title}
      description="Weekly offs and holidays aren't counted."
      submitLabel="Send"
      trigger={
        <Button size="sm" variant={variant}>
          {triggerLabel}
        </Button>
      }
    >
      <Field label="Leave type" name="typeKey">
        <Select id="typeKey" name="typeKey" defaultValue={types[0]?.typeKey}>
          {types.map((t) => (
            <option key={t.typeKey} value={t.typeKey}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First day" name="fromDay" type="date" required />
        <Field label="Last day" name="toDay" type="date" hint="Leave empty for one day." />
      </div>
      <Field label="How much of the day?" name="halfDay" hint="Half days are for a single day.">
        <Select id="halfDay" name="halfDay" defaultValue="">
          <option value="">Full day</option>
          <option value="AM">Morning only</option>
          <option value="PM">Afternoon only</option>
        </Select>
      </Field>
      <Field label="Reason" name="reason">
        <Textarea id="reason" name="reason" rows={2} />
      </Field>
      <Field label="Attachment" name="attachment" hint={needed.length ? `Needed for ${needed.join(", ")}.` : undefined}>
        <FileInput id="attachment" name="attachment" accept={FILE_ACCEPT} hint={`${ALLOWED_FILE_TYPES}, up to 5 MB`} />
      </Field>
    </ActionDialog>
  );
}
