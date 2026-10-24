import type { AdminPaymentDetail, PaymentDto } from "@edge/contracts";
import { AuthUser, Batch, Enrollment, OdooSyncLog, Payment, PaymentEvent, type PaymentDoc, Types } from "@edge/db";
import { NotFoundError } from "../errors";
import { oid } from "../ids";
import { iso } from "../mappers";
import { findPage, type PageInput } from "../paging";

async function decorate(payments: PaymentDoc[], withStudentName = false): Promise<PaymentDto[]> {
  const enrollments = await Enrollment.find({ _id: { $in: payments.map((p) => p.enrollmentId) } }, { batchId: 1, status: 1 }).lean();
  const batches = await Batch.find({ _id: { $in: enrollments.map((e) => e.batchId) } }, { name: 1 }).lean();
  const users = withStudentName ? await AuthUser.find({ _id: { $in: payments.map((p) => p.studentId) } }, { name: 1 }).lean() : [];
  const en = new Map(enrollments.map((e) => [String(e._id), e]));
  const bn = new Map(batches.map((b) => [String(b._id), b.name]));
  const un = new Map(users.map((u) => [String(u._id), u.name]));
  return payments.map((p) => {
    const e = en.get(String(p.enrollmentId));
    return {
      id: String(p._id),
      enrollmentId: String(p.enrollmentId),
      studentId: String(p.studentId),
      ...(withStudentName ? { studentName: un.get(String(p.studentId)) ?? "" } : {}),
      batchName: e ? (bn.get(String(e.batchId)) ?? "") : "",
      enrollmentStatus: e?.status ?? "",
      kind: p.kind,
      gateway: p.gateway,
      feeRateKey: p.feeRateKey,
      status: p.status,
      currency: p.currency,
      billingCountry: p.billingCountry,
      vatTreatment: p.vatTreatment,
      courseMinor: p.courseMinor,
      courseVatMinor: p.courseVatMinor,
      netMinor: p.netMinor,
      processingFeeMinor: p.processingFeeMinor,
      processingFeeVatMinor: p.processingFeeVatMinor,
      totalMinor: p.totalMinor,
      externalSessionId: p.externalSessionId ?? null,
      externalPaymentId: p.externalPaymentId ?? null,
      manualReference: p.manualReference ?? null,
      notes: p.notes ?? null,
      failureReason: p.failureReason ?? null,
      createdAt: iso(p.createdAt)!,
      succeededAt: iso(p.succeededAt),
      odoo: {
        status: p.odoo?.status ?? "PENDING",
        invoiceName: p.odoo?.invoiceName ?? null,
        invoiceUrl: p.odoo?.invoiceUrl ?? null,
        lastError: p.odoo?.lastError ?? null,
      },
    };
  });
}

export async function listStudentPayments(studentId: string) {
  return decorate(
    await Payment.find({ studentId: oid(studentId), status: { $ne: "CREATED" } })
      .sort({ createdAt: -1 })
      .lean(),
  );
}

export async function getStudentPayment(studentId: string, id: string) {
  const p = await Payment.findOne({ _id: oid(id, "Payment"), studentId: oid(studentId) }).lean();
  if (!p) throw new NotFoundError("Payment");
  return (await decorate([p]))[0]!;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listAdminPayments(f: { q?: string; status?: string; gateway?: string; odoo?: string } & PageInput) {
  const filter: Record<string, unknown> = { status: f.status ?? { $ne: "CREATED" } };
  if (f.gateway) filter.gateway = f.gateway;
  if (f.odoo) Object.assign(filter, { "odoo.status": f.odoo, status: "SUCCEEDED" });
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), "i");
    const users = await AuthUser.find({ $or: [{ name: rx }, { email: rx }, { phoneNumber: rx }] }, { _id: 1 })
      .limit(5000)
      .lean();
    filter.$or = [
      ...(Types.ObjectId.isValid(f.q) ? [{ _id: new Types.ObjectId(f.q) }] : []),
      { externalPaymentId: rx },
      { manualReference: rx },
      { studentId: { $in: users.map((u) => u._id) } },
    ];
  }
  // The summary covers every matching payment, not just this page.
  const [page, [sum]] = await Promise.all([
    findPage<PaymentDoc>(Payment, filter, { createdAt: -1 }, f),
    Payment.aggregate<{ totalMinor: number; courseVatMinor: number; feesMinor: number }>([
      { $match: { $and: [filter, { status: "SUCCEEDED" }] } },
      {
        $group: {
          _id: null,
          totalMinor: { $sum: "$totalMinor" },
          courseVatMinor: { $sum: "$courseVatMinor" },
          feesMinor: { $sum: { $add: ["$processingFeeMinor", "$processingFeeVatMinor"] } },
        },
      },
    ]),
  ]);
  return {
    ...page,
    rows: await decorate(page.rows, true),
    summary: { totalMinor: sum?.totalMinor ?? 0, courseVatMinor: sum?.courseVatMinor ?? 0, feesMinor: sum?.feesMinor ?? 0 },
  };
}

export async function listAdminStudentPayments(studentId: string) {
  return decorate(
    await Payment.find({ studentId: oid(studentId, "Student") })
      .sort({ createdAt: -1 })
      .lean(),
  );
}

export async function getAdminPayment(id: string): Promise<AdminPaymentDetail> {
  const p = await Payment.findById(oid(id, "Payment")).lean();
  if (!p) throw new NotFoundError("Payment");
  const [dto] = await decorate([p], true);
  const [events, logs] = await Promise.all([
    PaymentEvent.find({ paymentId: p._id }).sort({ receivedAt: -1 }).lean(),
    OdooSyncLog.find({ paymentId: p._id }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  return {
    ...dto!,
    events: events.map((e) => ({
      id: String(e._id),
      type: e.type,
      receivedAt: iso(e.receivedAt)!,
      processedAt: iso(e.processedAt),
      error: e.error ?? null,
    })),
    odooLogs: logs.map((l) => ({
      id: String(l._id),
      step: l.step,
      ok: l.ok,
      error: l.error ?? null,
      createdAt: iso((l as { createdAt?: Date }).createdAt)!,
    })),
  };
}
