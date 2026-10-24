import { catalogRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { Badge } from "@edge/ui/components/badge";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Plus, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CourseForm } from "@/components/catalog/course-form";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Courses & batches" };

export default async function BatchesPage() {
  await requireStaff("catalog.manage");
  const courses = await load(() => api(catalogRoutes.listCourses));
  return (
    <>
      <PageHeader
        help="/admin/docs/batches"
        title="Courses & batches"
        actions={
          courses.length ? (
            <Button asChild>
              <Link href="/admin/batches/new">
                <Plus /> New batch
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6">
        {courses.map((c) => (
          <Card key={c.id} className="p-0">
            <CardHeader className="px-6 pt-6">
              <CardTitle className="flex flex-wrap items-center gap-2">
                {c.title} <Badge variant="outline">{c.code}</Badge> {!c.isActive ? <Badge variant="outline">Inactive</Badge> : null}
              </CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
                      No batches yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  c.batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <Link href={`/admin/batches/${b.id}`} className="text-edge-emerald font-semibold hover:underline">
                          {b.name}
                        </Link>
                        <span className="text-muted-foreground ml-2 text-xs">{b.code}</span>
                        {b.isCurrentForEnrollment ? (
                          <Badge className="bg-edge-green text-edge-ink ml-2">
                            <Star className="size-3" /> Current
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatDate(b.startDate)}</TableCell>
                      <TableCell>{b.status.toLowerCase()}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(b.feeMinor, b.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.activeStudents ?? 0}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <details className="border-t px-6 py-4">
              <summary className="text-edge-emerald cursor-pointer text-sm font-semibold">Edit course</summary>
              <div className="mt-4">
                <CourseForm course={{ id: c.id, code: c.code, title: c.title, description: c.description, isActive: c.isActive }} />
              </div>
            </details>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>Add a course</CardTitle>
          </CardHeader>
          <CardContent>
            <CourseForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
