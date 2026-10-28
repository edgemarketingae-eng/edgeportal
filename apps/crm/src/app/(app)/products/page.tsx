import { crmRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { Badge } from "@edge/ui/components/badge";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductDialog } from "@/components/crm/product-dialog";
import { load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireCrm("crm.manage");
  const products = await load(() => api(crmRoutes.products));
  return (
    <>
      <PageHeader
        help="/docs/products"
        title="Products"
        description="What a lead can convert to. Sales mark conversions on the lead page; each one counts on the leaderboard."
        actions={<ProductDialog />}
      />
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="hidden md:table-cell">Description</TableHead>
              <TableHead className="text-right">This month</TableHead>
              <TableHead className="text-right">All time</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
                  No products yet.
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => (
                <TableRow key={p.id} className={p.status === "ARCHIVED" ? "opacity-60" : undefined}>
                  <TableCell>
                    <Link href={`/leads?product=${p.id}`} className="text-edge-emerald font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {p.isStudentCourse ? <Badge variant="outline">Student course</Badge> : null}
                      {p.status === "ARCHIVED" ? <Badge variant="outline">Archived</Badge> : null}
                    </span>
                    <span className="text-muted-foreground block text-xs">Added {formatDate(p.createdAt)}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-md text-sm whitespace-normal md:table-cell">
                    {p.description ?? "–"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.conversionsMonth}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{p.conversionsTotal}</TableCell>
                  <TableCell className="text-right">
                    <ProductDialog product={p} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <p className="text-muted-foreground mt-3 text-xs">
        Archived products disappear from the “Mark conversion” list but keep their history. Products are never deleted.
      </p>
    </>
  );
}
