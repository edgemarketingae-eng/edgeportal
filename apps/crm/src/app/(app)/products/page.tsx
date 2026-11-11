import { crmRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { TableEmpty } from "@edge/ui/blocks/empty-state";
import { Badge } from "@edge/ui/components/badge";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductDialog } from "@/components/crm/product-dialog";
import { DeleteButton } from "@/components/delete-button";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  const v = await requireCrm("crm.manage");
  const canPurge = can(v, "records.delete");
  const [products, options] = await Promise.all([load(() => api(crmRoutes.products)), load(() => api(crmRoutes.options))]);
  // General sells every product, so only the other projects are ticked in the dialog.
  const projects = options.projects.filter((p) => !p.isDefault).map((p) => ({ id: p.id, name: p.name }));
  return (
    <>
      <PageHeader
        help="/docs/products"
        title="Products"
        description="What a lead can convert to. Sales mark conversions on the lead page; each one counts on the leaderboard."
        actions={<ProductDialog projects={projects} />}
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
              <TableEmpty colSpan={5} title="No products yet." />
            ) : (
              products.map((p) => (
                <TableRow key={p.id} className={p.status === "ARCHIVED" ? "opacity-60" : undefined}>
                  <TableCell>
                    <Link href={`/leads?product=${p.id}&range=all`} className="text-edge-emerald font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {p.isStudentCourse ? <Badge variant="outline">Student course</Badge> : null}
                      {p.status === "ARCHIVED" ? <Badge variant="outline">Archived</Badge> : null}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      Sold in General{p.projects.map((x) => `, ${x.name}`).join("")}
                    </span>
                    <span className="text-muted-foreground block text-xs">Added {formatDate(p.createdAt)}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-md text-sm whitespace-normal md:table-cell">
                    {p.description ?? "–"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.conversionsMonth}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{p.conversionsTotal}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <ProductDialog product={p} projects={projects} />
                      {canPurge ? <DeleteButton type="product" id={p.id} iconOnly label={`Delete ${p.name}`} /> : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <p className="text-muted-foreground mt-3 text-xs">
        A lead can be marked converted only to products its project sells; General sells all of them. Archived products disappear from the
        “Mark conversion” list but keep their history.
        {canPurge ? " A product nobody has converted to can be deleted." : ""}
      </p>
    </>
  );
}
