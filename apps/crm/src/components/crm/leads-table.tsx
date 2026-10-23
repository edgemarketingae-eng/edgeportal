"use client";

import type { LeadListItem } from "@edge/contracts";
import { LEAD_SOURCE_LABELS } from "@edge/domain/crm/labels";
import { whatsappDigits } from "@edge/domain/crm/machine";
import { LeadStageBadge, TemperatureBadge } from "@edge/ui/blocks/status-badges";
import { Button } from "@edge/ui/components/button";
import { Card } from "@edge/ui/components/card";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import type { ActionState } from "@edge/ui/forms/field";
import { MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { toast } from "sonner";
import { bulkAssignAction } from "@/lib/actions/leads";
import { FollowUpDue, TimeAgo } from "./due";

const select = "h-8 rounded-lg border border-input bg-card px-2 text-sm";

/** `assignees` is the team the viewer may hand selected leads to (empty = no bulk assign). */
export function LeadsTable({ rows, assignees }: { rows: LeadListItem[]; assignees: { id: string; name: string }[] }) {
  const [, formAction, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const r = await bulkAssignAction(prev, form);
    if (r.ok) toast.success(r.message ?? "Done");
    if (r.error) toast.error(r.error);
    return r;
  }, {} as ActionState);
  const canAssign = assignees.length > 0;
  return (
    <form action={formAction}>
      {canAssign && rows.length ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Selected leads:</span>
          <select name="ownerId" className={select} aria-label="Assign to">
            <option value="">Unassign</option>
            {assignees.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {pending ? "Working…" : "Assign"}
          </Button>
        </div>
      ) : null}
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {canAssign ? <TableHead className="w-8" /> : null}
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
                <TableCell colSpan={canAssign ? 9 : 8} className="text-muted-foreground py-10 text-center">
                  No leads match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((l) => (
                <TableRow key={l.id}>
                  {canAssign ? (
                    <TableCell>
                      <Checkbox name="ids" value={l.id} aria-label={`Select ${l.name}`} />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Link href={`/leads/${l.id}`} className="text-edge-emerald font-semibold hover:underline">
                      {l.name}
                    </Link>
                    <div className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                      {l.email ? <span>{l.email}</span> : null}
                      {l.courseTitle ? <span>· {l.courseTitle}</span> : null}
                      {l.batchName ? <span>· {l.batchName}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {l.phone ? (
                      <span className="flex items-center gap-1.5">
                        <span className="tabular-nums">{l.phone}</span>
                        <a href={`https://wa.me/${whatsappDigits(l.phone)}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="text-edge-emerald hover:opacity-70">
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
                  <TableCell className="hidden lg:table-cell">{l.owner?.name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell className="hidden xl:table-cell">
                    {LEAD_SOURCE_LABELS[l.source]}
                    {l.sourceDetail ? <div className="text-muted-foreground max-w-40 truncate text-xs">{l.sourceDetail}</div> : null}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{l.nextFollowUpAt ? <FollowUpDue at={l.nextFollowUpAt} className="text-xs" /> : <span className="text-muted-foreground text-xs">none</span>}</TableCell>
                  <TableCell className="hidden xl:table-cell">{l.lastActivityAt ? <TimeAgo at={l.lastActivityAt} className="text-muted-foreground text-xs" /> : null}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </form>
  );
}
