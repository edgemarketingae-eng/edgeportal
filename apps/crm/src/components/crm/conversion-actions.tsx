"use client";

import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Plus } from "lucide-react";
import { markConversionsAction, removeConversionAction } from "@/lib/actions/products";

/** Mark the lead as converted to one or more products. Each counts as a conversion for the lead owner. */
export function MarkConversionDialog({ leadId, products }: { leadId: string; products: { id: string; name: string }[] }) {
  return (
    <ActionDialog
      action={markConversionsAction}
      hidden={{ id: leadId }}
      title="Mark conversion"
      description="Tick everything this lead has joined. Each one counts as a conversion for the lead's owner on the leaderboard."
      trigger={
        <Button size="sm" variant="outline">
          <Plus /> Conversion
        </Button>
      }
      submitLabel="Mark converted"
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Products</legend>
        {products.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <Checkbox name="productIds" value={p.id} /> {p.name}
          </label>
        ))}
      </fieldset>
      <div className="grid content-start gap-2">
        <Label htmlFor="conversion-note">Note (optional)</Label>
        <Textarea id="conversion-note" name="note" rows={2} placeholder="e.g. Joined after the webinar" />
      </div>
    </ActionDialog>
  );
}

export function RemoveConversionDialog({ id, product }: { id: string; product: string }) {
  return (
    <ActionDialog
      action={removeConversionAction}
      hidden={{ id }}
      title={`Remove ${product}?`}
      description="The conversion no longer counts for anyone. If it was the lead's only conversion (and they're not a student), the lead reopens at the stage it had."
      trigger={
        <Button size="sm" variant="ghost" className="text-muted-foreground h-7 px-2 text-xs">
          Remove
        </Button>
      }
      submitLabel="Remove"
      destructive
    />
  );
}
