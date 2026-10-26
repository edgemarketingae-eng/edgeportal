"use client";

import type { CrmOptions } from "@edge/contracts";
import { dialogLayout } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@edge/ui/components/dialog";
import { cn } from "@edge/ui/lib/utils";
import { Pencil } from "lucide-react";
import { useCallback, useState } from "react";
import { LeadForm, type LeadFormValues } from "./lead-form";

/** The lead page's "Edit" button: the full lead form in a wide dialog (Contact and Sales side by side, one column on phones). */
export function EditLeadDialog({
  values,
  options,
  meId,
  projectName,
}: {
  values: LeadFormValues;
  options: CrmOptions;
  meId: string;
  projectName: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className={cn(dialogLayout.content, "sm:max-w-4xl")}>
        <DialogHeader className={dialogLayout.header}>
          <DialogTitle>Edit lead</DialogTitle>
          <DialogDescription>
            {values.name} · {projectName}
          </DialogDescription>
        </DialogHeader>
        <LeadForm values={values} options={options} meId={meId} projectName={projectName} variant="dialog" onSaved={close} />
      </DialogContent>
    </Dialog>
  );
}
