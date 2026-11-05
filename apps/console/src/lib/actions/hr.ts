"use server";

import { ApiError, hrRoutes, type RouteBody } from "@edge/contracts";
import { checked, text, type ActionState } from "@edge/web/actions";
import { api, apiUpload } from "@edge/web/server";
import { run } from "./common";

type Area = "leave" | "requests" | "letters" | "documents";

/** The form's file, stored first so the feature route can claim it. Null when no file was chosen. */
async function upload(form: FormData, area: Area, ownerId?: string) {
  const file = form.get("attachment");
  if (!(file instanceof File) || !file.size) return null;
  return (await apiUpload(file, { module: "hr", area, ownerId })).id;
}

const json = <T>(form: FormData, key: string, fallback: T): T => {
  const raw = text(form, key);
  return raw ? (JSON.parse(raw) as T) : fallback;
};

const leaveBody = async (form: FormData): Promise<RouteBody<typeof hrRoutes.applyLeave>> => {
  const half = text(form, "halfDay");
  return {
    typeKey: text(form, "typeKey"),
    fromDay: text(form, "fromDay"),
    toDay: text(form, "toDay") || text(form, "fromDay"),
    halfDay: half === "AM" || half === "PM" ? half : null,
    reason: text(form, "reason"),
    attachmentId: await upload(form, "leave"),
  };
};

/* Self-service */

export async function applyLeaveAction(_prev: ActionState, form: FormData) {
  return run(async () => void (await api(hrRoutes.applyLeave, { body: await leaveBody(form) })), "Leave request sent to HR.");
}

export async function withdrawLeaveAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.cancelMyLeave, { params: { id: text(form, "id") } }));
}

export async function requestAdvanceAction(_prev: ActionState, form: FormData) {
  return run(
    async () => void (await api(hrRoutes.requestAdvance, { body: { amount: text(form, "amount"), reason: text(form, "reason") } })),
    "Advance request sent to HR.",
  );
}

export async function withdrawAdvanceAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.cancelMyAdvance, { params: { id: text(form, "id") } }));
}

export async function createHrRequestAction(_prev: ActionState, form: FormData) {
  return run(async () => {
    const body = {
      type: text(form, "type") as RouteBody<typeof hrRoutes.createRequest>["type"],
      subject: text(form, "subject"),
      details: text(form, "details"),
      attachmentId: await upload(form, "requests"),
    };
    await api(hrRoutes.createRequest, { body });
  }, "Request sent to HR.");
}

/* Work updates */

export async function saveWorkUpdateAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.saveMyUpdate, { body: { day: text(form, "day"), items: json<string[]>(form, "items", []) } }));
}

export async function clearWorkUpdateAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.saveMyUpdate, { body: { day: text(form, "day"), items: [] } }));
}

/* Team */

export async function saveEmployeeAction(_prev: ActionState, form: FormData) {
  const weeklyOff = form.getAll("weeklyOff").map(Number);
  const body: RouteBody<typeof hrRoutes.saveEmployee> = {
    employeeCode: text(form, "employeeCode"),
    department: text(form, "department"),
    joinedOn: text(form, "joinedOn"),
    leftOn: text(form, "leftOn"),
    nationality: text(form, "nationality"),
    passportNumber: text(form, "passportNumber"),
    emiratesId: text(form, "emiratesId"),
    emergencyName: text(form, "emergencyName"),
    emergencyPhone: text(form, "emergencyPhone"),
    weeklyOffOverride: checked(form, "ownWeeklyOff") ? weeklyOff : null,
    leaveOverrides: json(form, "leaveOverrides", []),
  };
  return run(() => api(hrRoutes.saveEmployee, { params: { id: text(form, "id") }, body }));
}

export async function savePayAction(_prev: ActionState, form: FormData) {
  const body: RouteBody<typeof hrRoutes.savePay> = {
    fromMonth: text(form, "fromMonth"),
    currency: text(form, "currency") as RouteBody<typeof hrRoutes.savePay>["currency"],
    base: text(form, "base"),
    allowances: json(form, "allowances", []),
    bankName: text(form, "bankName"),
    accountName: text(form, "accountName"),
    iban: text(form, "iban"),
    note: text(form, "note"),
  };
  return run(() => api(hrRoutes.savePay, { params: { id: text(form, "id") }, body }));
}

export async function adjustBalanceAction(_prev: ActionState, form: FormData) {
  return run(() =>
    api(hrRoutes.adjustBalance, {
      params: { id: text(form, "id") },
      body: { typeKey: text(form, "typeKey"), days: text(form, "days"), note: text(form, "note") },
    }),
  );
}

export async function fileLeaveAction(_prev: ActionState, form: FormData) {
  return run(async () => {
    const id = text(form, "id");
    await api(hrRoutes.fileLeave, { params: { id }, body: await leaveBody(form) });
  }, "Leave filed. It's waiting for approval.");
}

export async function addDocumentAction(_prev: ActionState, form: FormData) {
  return run(async () => {
    const id = text(form, "id");
    const fileId = await upload(form, "documents", id);
    if (!fileId) throw new ApiError(400, "VALIDATION", "Choose a file to upload.");
    return api(hrRoutes.addDocument, { params: { id }, body: { fileId } });
  });
}

export async function removeDocumentAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.removeDocument, { params: { id: text(form, "id"), fileId: text(form, "fileId") } }));
}

/* Attendance */

export async function markAttendanceAction(_prev: ActionState, form: FormData) {
  const rows = text(form, "ids")
    .split(",")
    .filter(Boolean)
    .map((employeeId) => {
      const status = text(form, `status:${employeeId}`);
      return {
        employeeId,
        status: (status || null) as "PRESENT" | "ABSENT" | "HALF_DAY" | "LATE" | null,
        note: text(form, `note:${employeeId}`),
      };
    });
  return run(() => api(hrRoutes.markAttendance, { body: { day: text(form, "day"), rows } }));
}

/* Leave decisions */

const decision = (form: FormData) => ({ note: text(form, "note"), allowNegative: checked(form, "allowNegative") });

export async function approveLeaveAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.approveLeave, { params: { id: text(form, "id") }, body: decision(form) }));
}

export async function rejectLeaveAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.rejectLeave, { params: { id: text(form, "id") }, body: decision(form) }));
}

export async function cancelLeaveAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.cancelLeave, { params: { id: text(form, "id") }, body: decision(form) }));
}

/* Requests inbox */

export async function replyRequestAction(_prev: ActionState, form: FormData) {
  return run(async () => {
    const replyFileId = await upload(form, "letters", text(form, "ownerId"));
    return api(hrRoutes.replyRequest, {
      params: { id: text(form, "id") },
      body: { status: text(form, "status") as RouteBody<typeof hrRoutes.replyRequest>["status"], reply: text(form, "reply"), replyFileId },
    });
  });
}

/* Advances */

export async function approveAdvanceAction(_prev: ActionState, form: FormData) {
  return run(() =>
    api(hrRoutes.approveAdvance, {
      params: { id: text(form, "id") },
      body: {
        firstMonth: text(form, "firstMonth"),
        months: Number(text(form, "months")),
        paidOn: text(form, "paidOn"),
        note: text(form, "note"),
      },
    }),
  );
}

export async function rejectAdvanceAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.rejectAdvance, { params: { id: text(form, "id") }, body: { note: text(form, "note") } }));
}

export async function rescheduleAdvanceAction(_prev: ActionState, form: FormData) {
  return run(() =>
    api(hrRoutes.rescheduleAdvance, { params: { id: text(form, "id") }, body: { installments: json(form, "installments", []) } }),
  );
}

/* Salary months */

export async function startMonthAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.startMonth, { body: { month: text(form, "month") } }));
}

export async function refreshMonthAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.refreshMonth, { params: { month: text(form, "month") } }));
}

export async function closeMonthAction(_prev: ActionState, form: FormData) {
  let closed = false;
  let changed = 0;
  const state = await run(async () => {
    ({ closed, changed } = await api(hrRoutes.closeMonth, { params: { month: text(form, "month") } }));
  });
  if (!state.ok) return state;
  if (closed) return { ok: true, message: "Month closed. Payslips are now with staff." };
  return {
    error: `Figures changed for ${changed} ${changed === 1 ? "person" : "people"} since you last looked, so the month wasn't closed. Review them and close again.`,
  };
}

export async function addLineAction(_prev: ActionState, form: FormData) {
  return run(() =>
    api(hrRoutes.addLine, {
      params: { id: text(form, "id") },
      body: {
        kind: text(form, "kind") as RouteBody<typeof hrRoutes.addLine>["kind"],
        label: text(form, "label"),
        currency: text(form, "currency") as RouteBody<typeof hrRoutes.addLine>["currency"],
        amount: text(form, "amount"),
      },
    }),
  );
}

export async function removeLineAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.removeLine, { params: { id: text(form, "id"), lineId: text(form, "lineId") } }));
}

/* Settings */

export async function saveHrSettingsAction(_prev: ActionState, form: FormData) {
  return run(() => api(hrRoutes.saveSettings, { body: json(form, "payload", { leaveTypes: [], weeklyOffDays: [], holidays: [] }) }));
}
