"use client";

import type { LeadListItem } from "@edge/contracts";
import { ROUND_ROBIN } from "@edge/domain/crm/enums";
import { LEAD_SOURCE_LABELS } from "@edge/domain/crm/labels";
import { whatsappDigits } from "@edge/domain/crm/machine";
import { LeadStageBadge, TemperatureBadge } from "@edge/ui/blocks/status-badges";
import { Button } from "@edge/ui/components/button";
import { Card } from "@edge/ui/components/card";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@edge/ui/components/dialog";
import { NativeSelect } from "@edge/ui/components/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { FormError, type ActionState } from "@edge/ui/forms/field";
import { MessageCircle, Phone, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { bulkAssignAction, bulkDeleteLeadsAction } from "@/lib/actions/leads";
import { UNASSIGN } from "@/lib/bulk";
import { ConfirmDelete } from "./lead-controls";
import { FollowUpDue, TimeAgo } from "./due";

/** What a bulk action applies to: ticked ids, or every lead matching the current filters. */
interface Target {
  ids: string[];
  allMatching: boolean;
  /** The list's filter query string, sent when `allMatching`. */
  filters: string;
  count: number;
}

function TargetFields({ t }: { t: Target }) {
  return t.allMatching ? (
    <>
      <input type="hidden" name="scope" value="filter" />
      <input type="hidden" name="filters" value={t.filters} />
    </>
  ) : (
    t.ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)
  );
}

const plural = (n: number) => `${n.toLocaleString("en")} lead${n === 1 ? "" : "s"}`;

function BulkDelete({ target, onDone }: { target: Target; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const r = await bulkDeleteLeadsAction(prev, form);
    if (r.ok) {
      toast.success(r.message ?? "Done");
      setOpen(false);
      onDone();
      return {} as ActionState;
    }
    return r;
  }, {} as ActionState);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 /> Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form action={formAction} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Delete {plural(target.count)}?</DialogTitle>
              <DialogDescription>
                {target.allMatching ? "Every lead matching the current filters, on every page. " : ""}Their activity history and tasks are
                removed for good. Leads linked to a student account are skipped. This can&apos;t be undone.
              </DialogDescription>
            </DialogHeader>
            <TargetFields t={target} />
            <FormError state={state} />
            <ConfirmDelete />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Working…" : "Delete leads"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BulkAssign({
  target,
  assignees,
  onDone,
}: {
  target: Target;
  assignees: { id: string; name: string; available?: boolean }[];
  onDone: () => void;
}) {
  const [, formAction, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const r = await bulkAssignAction(prev, form);
    if (r.ok) {
      toast.success(r.message ?? "Done");
      onDone();
    }
    if (r.error) toast.error(r.error);
    return r;
  }, {} as ActionState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <TargetFields t={target} />
      <NativeSelect size="sm" wrapperClassName="w-auto min-w-48" name="ownerId" aria-label="Assign to" defaultValue="" required>
        <option value="" disabled>
          Assign to…
        </option>
        <option value={ROUND_ROBIN}>Round-robin to sales executives</option>
        {assignees.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.available === false ? " (Off)" : ""}
          </option>
        ))}
        <option value={UNASSIGN}>Unassign (back to the pool)</option>
      </NativeSelect>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Working…" : "Assign"}
      </Button>
    </form>
  );
}

/**
 * Leads with selection for bulk actions. The header box ticks the page; then "select all matching" extends the
 * action to every lead the filters match, across pages. `assignees` is who the viewer may hand leads to (empty =
 * no bulk assign).
 */
export function LeadsTable({
  rows,
  total,
  filters,
  assignees,
  canDelete = false,
}: {
  rows: LeadListItem[];
  total: number;
  filters: string;
  assignees: { id: string; name: string; available?: boolean }[];
  canDelete?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [prevRows, setPrevRows] = useState(rows);
  if (rows !== prevRows) {
    // New page or filters: start over.
    setPrevRows(rows);
    setSelected(new Set());
    setAllMatching(false);
  }
  const canAssign = assignees.length > 0;
  const selectable = canAssign || canDelete;
  const pageIds = rows.map((r) => r.id);
  const pageAll = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const pageSome = pageIds.some((id) => selected.has(id));
  const clear = () => {
    setSelected(new Set());
    setAllMatching(false);
  };
  const toggle = (id: string, on: boolean) => {
    setAllMatching(false);
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  };
  const target: Target = { ids: [...selected], allMatching, filters, count: allMatching ? total : selected.size };
  return (
    <div>
      {selectable && target.count > 0 ? (
        <div className="bg-edge-mint/30 border-edge-emerald/20 mb-2 grid gap-2 rounded-xl border px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-semibold">
              {allMatching ? `All ${plural(total)} matching` : `${selected.size.toLocaleString("en")} selected`}
            </span>
            {canAssign ? <BulkAssign target={target} assignees={assignees} onDone={clear} /> : null}
            {canDelete ? <BulkDelete target={target} onDone={clear} /> : null}
            <Button type="button" size="sm" variant="ghost" onClick={clear} className="ml-auto">
              <X /> Clear
            </Button>
          </div>
          {pageAll && total > rows.length ? (
            <p className="text-muted-foreground">
              {allMatching ? (
                <>
                  Every lead matching these filters is selected.{" "}
                  <button type="button" onClick={() => setAllMatching(false)} className="text-edge-emerald font-semibold hover:underline">
                    Only this page
                  </button>
                </>
              ) : (
                <>
                  All {rows.length} leads on this page are selected.{" "}
                  <button type="button" onClick={() => setAllMatching(true)} className="text-edge-emerald font-semibold hover:underline">
                    Select all {plural(total)} matching these filters
                  </button>
                </>
              )}
            </p>
          ) : null}
        </div>
      ) : null}
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable ? (
                <TableHead className="w-8">
                  <Checkbox
                    aria-label="Select all leads on this page"
                    checked={pageAll ? true : pageSome ? "indeterminate" : false}
                    disabled={!rows.length}
                    onCheckedChange={(on) => {
                      setAllMatching(false);
                      setSelected(on === true ? new Set(pageIds) : new Set());
                    }}
                  />
                </TableHead>
              ) : null}
              <TableHead>Lead</TableHead>
              <TableHead className="hidden md:table-cell">Mobile</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="hidden lg:table-cell">Project</TableHead>
              <TableHead className="hidden lg:table-cell">Owner</TableHead>
              <TableHead className="hidden xl:table-cell">Source</TableHead>
              <TableHead className="hidden md:table-cell">Next follow-up</TableHead>
              <TableHead className="hidden xl:table-cell">Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={selectable ? 9 : 8} className="text-muted-foreground py-10 text-center">
                  No leads match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((l) => (
                <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined}>
                  {selectable ? (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(l.id)}
                        onCheckedChange={(on) => toggle(l.id, on === true)}
                        aria-label={`Select ${l.name}`}
                      />
                    </TableCell>
                  ) : null}
                  {/* Long names and emails wrap inside a capped width instead of widening the column. */}
                  <TableCell className="whitespace-normal">
                    <div className="max-w-64 min-w-32">
                      <Link href={`/leads/${l.id}`} className="text-edge-emerald font-semibold wrap-anywhere hover:underline">
                        {l.name}
                      </Link>
                      <div className="text-muted-foreground flex flex-wrap gap-x-2 text-xs wrap-anywhere">
                        {l.email ? <span>{l.email}</span> : null}
                        {l.courseTitle ? <span>· {l.courseTitle}</span> : null}
                        {l.batchName ? <span>· {l.batchName}</span> : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {l.phone ? (
                      <span className="flex items-center gap-1.5">
                        <span className="tabular-nums">{l.phone}</span>
                        <a
                          href={`https://wa.me/${whatsappDigits(l.phone)}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="WhatsApp"
                          className="text-edge-emerald hover:opacity-70"
                        >
                          <MessageCircle className="size-4" />
                        </a>
                        <a href={`tel:${l.phone}`} aria-label="Call" className="text-muted-foreground hover:opacity-70">
                          <Phone className="size-4" />
                        </a>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <LeadStageBadge stage={l.stage} />
                      {l.stage !== "CONVERTED" && l.stage !== "LOST" ? <TemperatureBadge temperature={l.temperature} /> : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Link href={`/projects/${l.project.id}`} className="hover:underline">
                      {l.project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {l.owner?.name ?? <span className="text-muted-foreground">Unassigned</span>}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    {LEAD_SOURCE_LABELS[l.source]}
                    {l.sourceDetail ? <div className="text-muted-foreground max-w-40 truncate text-xs">{l.sourceDetail}</div> : null}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {l.nextFollowUpAt ? (
                      <FollowUpDue at={l.nextFollowUpAt} className="text-xs" />
                    ) : (
                      <span className="text-muted-foreground text-xs">none</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    {l.lastActivityAt ? <TimeAgo at={l.lastActivityAt} className="text-muted-foreground text-xs" /> : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
