import { z } from "zod";
import { GATEWAYS, PAYMENT_KINDS, PAYMENT_STATUSES, SYNC_STATUSES, VAT_TREATMENTS } from "@edge/domain/enums";
import { zOk } from "./common";
import { route } from "./route";

export const PublicFeeRate = z.object({
  key: z.string(),
  gateway: z.enum(GATEWAYS),
  label: z.string(),
  description: z.string().nullable(),
  pct: z.string(),
  fixedMinor: z.number(),
  feeVatRate: z.string(),
  minTotalMinor: z.number().nullable(),
  maxTotalMinor: z.number().nullable(),
});
export type PublicFeeRate = z.infer<typeof PublicFeeRate>;

export const CheckoutOptionsDto = z.object({
  enrollmentId: z.string(),
  batchName: z.string(),
  courseTitle: z.string(),
  currency: z.string(),
  feeMinor: z.number(),
  remainingMinor: z.number(),
  vatTreatment: z.enum(VAT_TREATMENTS),
  courseVatRate: z.string(),
  canCheckout: z.boolean(),
  canPayBalance: z.boolean(),
  balanceDueOn: z.string().nullable(),
  advance: z.object({ enabled: z.boolean(), presetsMinor: z.array(z.number()), minMinor: z.number().nullable(), allowCustom: z.boolean() }),
  methods: z.array(PublicFeeRate),
});
export type CheckoutOptionsDto = z.infer<typeof CheckoutOptionsDto>;

export const CheckoutKind = z.enum(["FULL", "ADVANCE", "BALANCE"]);
export const CheckoutInput = z.object({
  kind: CheckoutKind,
  amountMinor: z.coerce.number().int().positive().optional(),
  feeRateKey: z.string().min(1, "Choose a payment method"),
});

export const PaymentDto = z.object({
  id: z.string(),
  enrollmentId: z.string(),
  studentId: z.string(),
  studentName: z.string().optional(),
  batchName: z.string(),
  enrollmentStatus: z.string(),
  kind: z.enum(PAYMENT_KINDS),
  gateway: z.enum(GATEWAYS),
  feeRateKey: z.string(),
  status: z.enum(PAYMENT_STATUSES),
  currency: z.string(),
  billingCountry: z.string(),
  vatTreatment: z.enum(VAT_TREATMENTS),
  courseMinor: z.number(),
  courseVatMinor: z.number(),
  netMinor: z.number(),
  processingFeeMinor: z.number(),
  processingFeeVatMinor: z.number(),
  totalMinor: z.number(),
  externalSessionId: z.string().nullable(),
  externalPaymentId: z.string().nullable(),
  manualReference: z.string().nullable(),
  notes: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.string(),
  succeededAt: z.string().nullable(),
  odoo: z.object({ status: z.enum(SYNC_STATUSES), invoiceName: z.string().nullable(), invoiceUrl: z.string().nullable(), lastError: z.string().nullable() }),
});
export type PaymentDto = z.infer<typeof PaymentDto>;

export const AdminPaymentDetail = PaymentDto.extend({
  events: z.array(z.object({ id: z.string(), type: z.string(), receivedAt: z.string(), processedAt: z.string().nullable(), error: z.string().nullable() })),
  odooLogs: z.array(z.object({ id: z.string(), step: z.string(), ok: z.boolean(), error: z.string().nullable(), createdAt: z.string() })),
});
export type AdminPaymentDetail = z.infer<typeof AdminPaymentDetail>;

export const PaymentFilters = z.object({ q: z.string().optional(), status: z.enum(PAYMENT_STATUSES).optional(), gateway: z.enum(GATEWAYS).optional(), odoo: z.enum(SYNC_STATUSES).optional() });

export const ManualPaymentInput = z.object({
  studentId: z.string().min(1),
  kind: CheckoutKind,
  amount: z.string().optional(),
  method: z.enum(["BANK_TRANSFER", "CASH", "OTHER"]),
  reference: z.string().trim().min(2, "Enter the bank or receipt reference"),
  notes: z.string().optional(),
});

const idParam = z.object({ id: z.string() });

export const paymentRoutes = {
  checkoutOptions: route({ method: "GET", path: "/api/v1/student/checkout/options", response: CheckoutOptionsDto }),
  checkout: route({ method: "POST", path: "/api/v1/student/checkout", body: CheckoutInput, response: z.object({ paymentId: z.string(), redirectUrl: z.string() }) }),
  studentPayments: route({ method: "GET", path: "/api/v1/student/payments", response: z.array(PaymentDto) }),
  studentPayment: route({ method: "GET", path: "/api/v1/student/payments/:id", params: idParam, response: PaymentDto }),
  adminPayments: route({
    method: "GET",
    path: "/api/v1/admin/payments",
    query: PaymentFilters,
    response: z.object({ rows: z.array(PaymentDto), summary: z.object({ totalMinor: z.number(), courseVatMinor: z.number(), feesMinor: z.number() }) }),
  }),
  adminPayment: route({ method: "GET", path: "/api/v1/admin/payments/:id", params: idParam, response: AdminPaymentDetail }),
  adminStudentPayments: route({ method: "GET", path: "/api/v1/admin/students/:id/payments", params: idParam, response: z.array(PaymentDto) }),
  manual: route({ method: "POST", path: "/api/v1/admin/payments/manual", body: ManualPaymentInput, response: z.object({ ok: z.literal(true), paymentId: z.string() }) }),
  recheck: route({ method: "POST", path: "/api/v1/admin/payments/:id/sync", params: idParam, response: z.object({ ok: z.literal(true), message: z.string() }) }),
  odooRetry: route({ method: "POST", path: "/api/v1/admin/payments/:id/odoo-retry", params: idParam, response: zOk }),
};
