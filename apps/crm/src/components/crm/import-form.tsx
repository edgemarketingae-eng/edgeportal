"use client";

import type { CrmOptions } from "@edge/contracts";
import { LEAD_SOURCES } from "@edge/domain/crm/enums";
import { LEAD_SOURCE_LABELS } from "@edge/domain/crm/labels";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Input } from "@edge/ui/components/input";
import { Label } from "@edge/ui/components/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { Textarea } from "@edge/ui/components/textarea";
import { NativeSelect } from "@edge/ui/components/native-select";
import { CountrySelect } from "@edge/ui/forms/phone-input";
import { HOME_COUNTRY } from "@edge/domain/countries";
import { FormError, FormMessage } from "@edge/ui/forms/field";
import Link from "next/link";
import { useActionState } from "react";
import { importLeadsAction, previewImportAction } from "@/lib/actions/import";
import type { ImportState } from "./import-types";
import { ProjectOwnerFields } from "./quick-add-dialog";

export function ImportForm({ options, meId }: { options: CrmOptions; meId: string }) {
  const [preview, previewAction, previewing] = useActionState(previewImportAction, {} as ImportState);
  const [result, importAction, importing] = useActionState(importLeadsAction, {} as ImportState);
  const v = preview.values;

  if (result.step === "done" && result.result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import finished</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <FormMessage state={result} />
          <p>
            <b>{result.result.created}</b> created · <b>{result.result.skipped}</b> skipped (duplicates) · <b>{result.result.invalid}</b>{" "}
            invalid
          </p>
          <Button asChild className="w-fit" size="sm">
            <Link href="/leads?created=today&view=all">Open the new leads</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Paste or upload a CSV</CardTitle>
          <CardDescription>
            First row = column names. Needs <b>name</b> plus <b>phone</b> and/or <b>email</b>; optional <b>country</b>, <b>notes</b>,{" "}
            <b>tags</b>, <b>source detail</b>, <b>language</b>. Up to 2,000 rows per import. Existing leads and students are skipped, never
            overwritten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form key={JSON.stringify(v ?? {})} action={previewAction} className="grid gap-3">
            <FormError state={preview} />
            <Textarea
              name="csv"
              rows={6}
              placeholder={
                "name,phone,email,country,notes\nAmy Khan,+971501234567,amy@example.com,AE,Asked about November batch\nRavi Kumar,+919876543210,,IN,"
              }
              defaultValue={v?.csv}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="file">…or a file</Label>
                <Input id="file" name="file" type="file" accept=".csv,text/csv" className="h-auto py-1.5" />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="source">Source for these leads</Label>
                <NativeSelect id="source" name="source" defaultValue={v?.source || "IMPORT"}>
                  {LEAD_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_SOURCE_LABELS[s]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="defaultCountry">Country for numbers without a +code</Label>
                <CountrySelect
                  id="defaultCountry"
                  name="defaultCountry"
                  defaultValue={v?.defaultCountry ?? HOME_COUNTRY}
                  emptyLabel="None: every number has its +code"
                />
              </div>
              <ProjectOwnerFields options={options} meId={meId} defaultProjectId={v?.projectId} defaultOwnerId={v?.ownerId} roundRobin />
            </div>
            <Button type="submit" size="sm" className="w-fit" disabled={previewing}>
              {previewing ? "Checking…" : "Check the file"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {preview.step === "preview" && preview.preview && v ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Review and import</CardTitle>
            <CardDescription>
              {preview.preview.total} rows: <b>{preview.preview.valid}</b> will be created, <b>{preview.preview.duplicates}</b> skipped as
              duplicates, <b>{preview.preview.invalid}</b> invalid.
              {preview.preview.rows.length < preview.preview.total ? ` Showing the first ${preview.preview.rows.length}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <FormError state={result} />
            <form action={importAction}>
              <input type="hidden" name="csv" value={v.csv} />
              <input type="hidden" name="projectId" value={v.projectId} />
              <input type="hidden" name="source" value={v.source} />
              <input type="hidden" name="ownerId" value={v.ownerId ?? ""} />
              <input type="hidden" name="defaultCountry" value={v.defaultCountry ?? ""} />
              <Button type="submit" size="sm" disabled={importing || preview.preview.valid === 0}>
                {importing ? "Importing…" : `Import ${preview.preview.valid} lead${preview.preview.valid === 1 ? "" : "s"}`}
              </Button>
            </form>
            <div className="max-h-96 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.preview.rows.map((r) => (
                    <TableRow key={r.row}>
                      <TableCell className="text-muted-foreground">{r.row}</TableCell>
                      <TableCell>{r.name || <span className="text-muted-foreground">–</span>}</TableCell>
                      <TableCell className="tabular-nums">{r.phone ?? "–"}</TableCell>
                      <TableCell>{r.email ?? "–"}</TableCell>
                      <TableCell
                        className={
                          r.status === "ok" ? "text-edge-emerald" : r.status === "duplicate" ? "text-amber-700" : "text-destructive"
                        }
                      >
                        {r.status === "ok" ? "Will create" : r.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
