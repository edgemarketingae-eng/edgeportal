import { adminRoutes, catalogRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { ENROLLMENT_STATUSES, PAYMENT_STATES } from "@edge/domain/enums";
import { formatMoney } from "@edge/domain/money";
import { FilterBar, FilterResults, FilterScope, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { EnrollmentBadge, PaymentStateBadge } from "@edge/ui/blocks/status-badges";
import { Button } from "@edge/ui/components/button";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { Pagination } from "@edge/ui/blocks/pagination";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Students" };

const STATUS_OPTIONS: [string, string][] = [
  ["PENDING_PAYMENT", "Awaiting payment"],
  ["PENDING_APPROVAL", "Needs approval"],
  ["ACTIVE", "Active"],
  ["LOCKED", "Locked"],
  ["REJECTED", "Rejected"],
  ["NONE", "No batch"],
];
const PAYMENT_OPTIONS: [string, string][] = [
  ["UNPAID", "Unpaid"],
  ["PARTIALLY_PAID", "Advance paid"],
  ["PAID", "Fully paid"],
];

export default async function StudentsPage(props: PageProps<"/admin/students">) {
  await requireStaff("student.read");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? sp[k] : undefined);
  // Ignore unknown enum values instead of letting the API reject the whole request.
  const pick = <T extends string>(k: string, allowed: readonly T[]) => allowed.find((a) => a === one(k));
  const f = {
    q: one("q"),
    status: pick("status", [...ENROLLMENT_STATUSES, "NONE"] as const),
    payment: pick("payment", PAYMENT_STATES),
    batch: one("batch"),
    page: Number(one("page")) || 1,
    pageSize: Number(one("pageSize")) || 50,
  };
  const [{ rows, total, page, pageSize }, batches] = await Promise.all([
    load(() => api(adminRoutes.students, { query: f })),
    load(() => api(catalogRoutes.listBatches)),
  ]);
  const qs = new URLSearchParams(
    Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "page" && k !== "pageSize") as [string, string][],
  ).toString();

  return (
    <FilterScope>
      <PageHeader
        help="/admin/docs/students"
        title="Students"
        description={`${total} student${total === 1 ? "" : "s"}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={`/admin/students/export?${qs}`} download>
              <Download /> Export CSV
            </a>
          </Button>
        }
      />
      <FilterBar q={f.q}>
        <FilterSelect name="status" label="Status" value={f.status} options={STATUS_OPTIONS} />
        <FilterSelect name="payment" label="Payment" value={f.payment} options={PAYMENT_OPTIONS} />
        <FilterSelect name="batch" label="Batch" value={f.batch} options={batches.map((b) => [b.id, b.name])} />
      </FilterBar>
      <FilterResults>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead className="hidden md:table-cell">Mobile</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Payment</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Paid</TableHead>
                <TableHead className="hidden xl:table-cell">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                    No students match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((s) => {
                  const e = s.enrollment;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link href={`/admin/students/${s.id}`} className="text-edge-emerald font-semibold hover:underline">
                          {s.name}
                        </Link>
                        <div className="text-muted-foreground text-xs">{s.email}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {s.phoneNumber ?? <span className="text-muted-foreground">{s.pendingPhone ? "unverified" : "-"}</span>}
                      </TableCell>
                      <TableCell>{e?.batchName ?? <span className="text-muted-foreground">None</span>}</TableCell>
                      <TableCell>{e ? <EnrollmentBadge status={e.status} lockReason={e.lockReason} /> : null}</TableCell>
                      <TableCell className="hidden lg:table-cell">{e ? <PaymentStateBadge state={e.paymentState} /> : null}</TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">
                        {e ? formatMoney(e.paidCourseMinor, e.currency) : "-"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">{formatDate(s.createdAt)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
        <Pagination page={page} pageSize={pageSize} total={total} noun="students" />
      </FilterResults>
    </FilterScope>
  );
}
