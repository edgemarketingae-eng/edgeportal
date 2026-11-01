"use client";

import type { AttendanceSheet } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { MARKABLE_ATTENDANCE } from "@edge/domain/hr/enums";
import { ATTENDANCE_LABELS } from "@edge/domain/hr/labels";
import { AttendanceBadge } from "@edge/ui/blocks/status-badges";
import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { Button } from "@edge/ui/components/button";
import { Card } from "@edge/ui/components/card";
import { Input } from "@edge/ui/components/input";
import { Select } from "@edge/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { DatePicker } from "@edge/ui/forms/date-picker";
import { FormError } from "@edge/ui/forms/field";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { markAttendanceAction } from "@/lib/actions/hr";
import { useSaveAction } from "./use-save-action";

export function AttendanceDayForm({ sheet }: { sheet: AttendanceSheet }) {
  const router = useRouter();
  const [state, action, pending] = useSaveAction(markAttendanceAction);
  const markable = sheet.rows.filter((r) => r.source !== "LEAVE");
  const [statuses, setStatuses] = useState<Record<string, string>>(Object.fromEntries(markable.map((r) => [r.employeeId, r.status ?? ""])));
  const readOnly = sheet.locked || sheet.future;
  const markAllPresent = () =>
    setStatuses(Object.fromEntries(markable.map((r) => [r.employeeId, statuses[r.employeeId] || (r.off ? "" : "PRESENT")])));
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="day" value={sheet.day} />
      <input type="hidden" name="ids" value={markable.map((r) => r.employeeId).join(",")} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-56">
          <DatePicker
            key={sheet.day}
            id="pick-day"
            name="pick-day"
            mode="date"
            defaultValue={sheet.day}
            onValueChange={(day) => day && router.push(`/staff/hr/attendance?day=${day}`)}
            aria-label="Day"
          />
        </div>
        {!readOnly ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={markAllPresent}>
              Mark all present
            </Button>
            <Button size="sm" pending={pending}>
              Save
            </Button>
          </div>
        ) : null}
      </div>
      <FormError state={state} />
      {sheet.locked ? (
        <Alert>
          <AlertDescription>This month&apos;s salary is closed, so {formatDate(sheet.day)} can&apos;t change.</AlertDescription>
        </Alert>
      ) : null}
      {sheet.future ? (
        <Alert>
          <AlertDescription>This day hasn&apos;t happened yet.</AlertDescription>
        </Alert>
      ) : null}
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.rows.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell className="font-medium">
                  {r.name}
                  {r.off ? (
                    <div className="text-muted-foreground text-xs font-normal">
                      {r.off === "HOLIDAY" ? (r.holidayName ?? "Holiday") : "Weekly off"}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="min-w-40">
                  {r.source === "LEAVE" ? (
                    <AttendanceBadge status="LEAVE" />
                  ) : readOnly ? (
                    r.status ? (
                      <AttendanceBadge status={r.status} />
                    ) : (
                      <span className="text-muted-foreground text-xs">Not marked</span>
                    )
                  ) : (
                    <Select
                      aria-label={`Status for ${r.name}`}
                      name={`status:${r.employeeId}`}
                      size="sm"
                      value={statuses[r.employeeId] ?? ""}
                      onChange={(e) => setStatuses({ ...statuses, [r.employeeId]: e.target.value })}
                    >
                      <option value="">Not marked</option>
                      {MARKABLE_ATTENDANCE.map((s) => (
                        <option key={s} value={s}>
                          {ATTENDANCE_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {r.source === "LEAVE" || readOnly ? (
                    <span className="text-muted-foreground text-xs">{r.note}</span>
                  ) : (
                    <Input aria-label={`Note for ${r.name}`} name={`note:${r.employeeId}`} defaultValue={r.note ?? ""} className="h-8" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </form>
  );
}
