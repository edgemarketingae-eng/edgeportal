"use client";

import type { ProductDto } from "@edge/contracts";
import { PRODUCT_STATUSES } from "@edge/domain/crm/enums";
import { PRODUCT_STATUS_LABELS } from "@edge/domain/crm/labels";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Field } from "@edge/ui/forms/field";
import { SegmentedControl } from "@edge/ui/forms/segmented-control";
import { Plus } from "lucide-react";
import { saveProductAction } from "@/lib/actions/products";

/** Add a product, or edit one when `product` is given. */
export function ProductDialog({ product }: { product?: ProductDto }) {
  return (
    <ActionDialog
      action={saveProductAction}
      hidden={product ? { id: product.id } : {}}
      title={product ? `Edit ${product.name}` : "New product"}
      description="Something a lead can convert to. Sales mark it on the lead page; every conversion counts on the leaderboard."
      trigger={
        product ? (
          <Button size="sm" variant="outline">
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> New product
          </Button>
        )
      }
      submitLabel={product ? "Save" : "Add product"}
      size="md"
    >
      <Field label="Name" name="name" defaultValue={product?.name} required placeholder="Wealth Circle" />
      <div className="grid content-start gap-2">
        <Label htmlFor="product-description">Description (optional)</Label>
        <Textarea
          id="product-description"
          name="description"
          rows={2}
          defaultValue={product?.description ?? ""}
          placeholder="What counts as joining"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Order in lists" name="sortOrder" type="number" min={0} defaultValue={String(product?.sortOrder ?? 50)} />
        {product ? (
          <SegmentedControl
            name="status"
            label="Status"
            defaultValue={product.status}
            options={PRODUCT_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_LABELS[s] }))}
          />
        ) : null}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox name="isStudentCourse" defaultChecked={product?.isStudentCourse} className="mt-0.5" />
        <span>
          Student course: a lead becoming a student (Convert to student, Link to student, or signing up on the portal) counts as converting
          to this product. Only one product can be the student course.
        </span>
      </label>
    </ActionDialog>
  );
}
