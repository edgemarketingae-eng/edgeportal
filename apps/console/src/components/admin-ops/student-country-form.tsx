"use client";

import { Button } from "@edge/ui/components/button";
import type { ActionState } from "@edge/ui/forms/field";
import { CountrySelect } from "@edge/ui/forms/phone-input";
import { useActionState } from "react";
import { toast } from "sonner";
import { setStudentCountryAction } from "@/app/admin/students/[id]/actions";

/** Correct a student's country of residence (VAT and payment methods for future checkouts). */
export function StudentCountryForm({ studentId, country }: { studentId: string; country: string }) {
  const [, action, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const r = await setStudentCountryAction(prev, form);
    if (r.ok) toast.success(r.message ?? "Saved");
    if (r.error) toast.error(r.error);
    return r;
  }, {} as ActionState);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="flex gap-2">
        <CountrySelect key={country} name="country" defaultValue={country} size="sm" aria-label="Country of residence" />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Decides VAT and payment methods for future checkouts. A paid enrollment keeps the VAT it started with.
      </p>
    </form>
  );
}
