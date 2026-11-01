import type { HrRequestDto, HrRequestFilters, HrRequestInput, HrRequestReplyInput } from "@edge/contracts";
import { FileAsset, HrRequest, Types, withTx, type HrRequestDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { HR_REQUEST_LABELS, HR_REQUEST_STATUS_LABELS } from "@edge/domain/hr/labels";
import { audit } from "../audit";
import { userNames } from "../crm/common";
import { NotFoundError, TransitionError } from "../errors";
import { claimFile } from "../files/service";
import { oid } from "../ids";
import { iso } from "../mappers";
import { notifyPermissionHolders } from "../notifications/in-app";
import { findPage } from "../paging";
import { hrHref, loadOwnRecord, tellEmployee, type HrActor } from "./common";

async function toDtos(rows: HrRequestDoc[]): Promise<HrRequestDto[]> {
  if (!rows.length) return [];
  const [names, files] = await Promise.all([
    userNames(rows.flatMap((r) => [r.employeeId, r.handledById])),
    FileAsset.find({ _id: { $in: rows.flatMap((r) => [r.attachmentId, r.replyFileId]).filter(Boolean) } }, { originalName: 1 }).lean(),
  ]);
  const fileName = new Map(files.map((f) => [String(f._id), f.originalName]));
  const ref = (id: Types.ObjectId | null | undefined) => (id ? { id: String(id), name: fileName.get(String(id)) ?? "Attachment" } : null);
  return rows.map((r) => ({
    id: String(r._id),
    employee: { id: String(r.employeeId), name: names.get(String(r.employeeId)) ?? "Unknown" },
    type: r.type,
    subject: r.subject,
    details: r.details ?? null,
    attachment: ref(r.attachmentId),
    status: r.status,
    reply: r.reply ?? null,
    replyFile: ref(r.replyFileId),
    handledBy: r.handledById ? { id: String(r.handledById), name: names.get(String(r.handledById)) ?? "Unknown" } : null,
    handledAt: iso(r.handledAt),
    createdAt: iso(r.createdAt)!,
  }));
}

export async function myRequests(userId: string) {
  return toDtos(
    (await HrRequest.find({ employeeId: oid(userId) })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()) as HrRequestDoc[],
  );
}

export async function createHrRequest(userId: string, input: HrRequestInput, actor: HrActor) {
  const e = await loadOwnRecord(userId);
  const id = await withTx(async () => {
    const [r] = await HrRequest.create([
      {
        employeeId: e._id,
        type: input.type,
        subject: input.subject.trim(),
        details: input.details?.trim() || null,
        attachmentId: input.attachmentId ? new Types.ObjectId(input.attachmentId) : null,
      },
    ]);
    if (input.attachmentId) await claimFile(input.attachmentId, actor, { linkedType: "HrRequest", linkedId: r!._id, ownerId: e._id });
    await audit({ actor, action: "hr.request.create", entityType: "HrRequest", entityId: String(r!._id), after: { type: input.type } });
    return String(r!._id);
  });
  await notifyPermissionHolders("hr.manage", {
    title: "New HR request",
    body: `${(await userNames([e._id])).get(String(e._id)) ?? "Someone"}: ${HR_REQUEST_LABELS[input.type]}`,
    href: hrHref("/hr/requests"),
  });
  return id;
}

export async function listHrRequests(q: HrRequestFilters) {
  const page = await findPage<HrRequestDoc>(HrRequest, q.status ? { status: q.status } : {}, { createdAt: -1 }, q);
  return { ...page, rows: await toDtos(page.rows) };
}

export async function replyHrRequest(id: string, input: HrRequestReplyInput, actor: HrActor) {
  const r = await HrRequest.findById(oid(id, "Request")).lean();
  if (!r) throw new NotFoundError("Request");
  if (r.status === "DONE" || r.status === "REJECTED") throw new TransitionError("This request is already closed");
  await withTx(async () => {
    await HrRequest.updateOne(
      { _id: r._id },
      {
        $set: {
          status: input.status,
          reply: input.reply?.trim() || null,
          handledById: new Types.ObjectId(actor.id),
          handledAt: now(),
          ...(input.replyFileId ? { replyFileId: new Types.ObjectId(input.replyFileId) } : {}),
        },
      },
    );
    if (input.replyFileId) await claimFile(input.replyFileId, actor, { linkedType: "HrRequest", linkedId: r._id, ownerId: r.employeeId });
    await audit({ actor, action: "hr.request.reply", entityType: "HrRequest", entityId: id, after: { status: input.status } });
  });
  await tellEmployee(String(r.employeeId), {
    title: `HR request: ${HR_REQUEST_STATUS_LABELS[input.status].toLowerCase()}`,
    body: `${r.subject}.`,
    path: "/requests",
  });
}
