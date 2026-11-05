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
import { CheckList } from "./check-list";

/**
 * Add a product, or edit one when `product` is given. `projects` are the projects that can sell it (General excluded,
 * it sells everything); archived projects that still sell it are added from the product itself.
 */
export function ProductDialog({ product, projects }: { product?: ProductDto; projects: { id: string; name: string }[] }) {
  const archived = (product?.projects ?? []).filter((p) => p.status === "ARCHIVED" && !projects.some((x) => x.id === p.id));
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
      <CheckList
        name="projectIds"
        legend="Projects that sell it"
        hint="Their leads can be marked converted to it. General always sells every product."
        items={[
          ...projects.map((p) => ({ id: p.id, label: p.name })),
          ...archived.map((p) => ({ id: p.id, label: p.name, note: "Archived project" })),
        ]}
        selected={(product?.projects ?? []).map((p) => p.id)}
        empty="No projects besides General yet."
      />
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
