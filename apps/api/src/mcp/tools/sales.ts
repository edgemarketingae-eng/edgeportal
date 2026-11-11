import { crmRoutes } from "@edge/contracts";
import { DEPOSIT_SEQUENCES, DEPOSIT_STATUSES, LEADERBOARD_PERIODS, PRODUCT_STATUSES } from "@edge/domain/crm/enums";
import { z } from "zod";
import { defined, defineTool, ref, zDay, zDays, zId, zPageNo, zPageSize } from "./kit";

export const markConversions = defineTool({
  name: "mark_conversions",
  title: "Record product conversions",
  description:
    "Record that a lead bought one or more products (ids from get_lead's productsItCanConvertTo). The lead becomes " +
    "CONVERTED and the conversion is credited to its owner.",
  input: {
    leadId: zId("Lead"),
    productIds: z.array(zId("Product")).min(1).max(20),
    note: z.string().trim().max(1000).optional(),
  },
  routes: [crmRoutes.markConversions],
  perms: ["crm.write"],
  kind: "write",
  async run({ leadId, ...body }, { call }) {
    return call(crmRoutes.markConversions, { params: { id: leadId }, body: defined(body) });
  },
});

export const removeConversion = defineTool({
  name: "remove_conversion",
  title: "Remove a conversion",
  description: "Remove a product conversion recorded by mistake (conversion ids are on get_lead).",
  input: { conversionId: zId("Conversion") },
  routes: [crmRoutes.removeConversion],
  perms: ["crm.manage"],
  kind: "destructive",
  async run({ conversionId }, { call }) {
    return call(crmRoutes.removeConversion, { params: { id: conversionId } });
  },
});

export const logDeposit = defineTool({
  name: "log_deposit",
  title: "Log a broker deposit",
  description:
    "Record a lead's deposit with the broker (JetaFX), in USD. FIRST = their first deposit, LATER = any deposit after it. It " +
    "stays pending until someone who manages commission verifies it. jetaFxClientId is required if the lead has none yet.",
  input: {
    leadId: zId("Lead"),
    sequence: z.enum(DEPOSIT_SEQUENCES),
    amountUsd: z.union([z.number().positive(), z.string().trim().min(1)]).describe("e.g. 500 or 1250.50"),
    depositedOn: zDay.describe("The day they deposited, YYYY-MM-DD"),
    jetaFxClientId: z.string().trim().max(40).optional(),
    reference: z.string().trim().max(120).optional().describe("The broker's transaction reference"),
    note: z.string().trim().max(1000).optional(),
  },
  routes: [crmRoutes.logDeposit],
  perms: ["crm.write"],
  kind: "write",
  async run({ leadId, amountUsd, depositedOn, ...rest }, { call }) {
    const { id } = await call(crmRoutes.logDeposit, {
      params: { id: leadId },
      body: defined({ ...rest, amount: String(amountUsd), depositedAt: depositedOn }),
    });
    return { ok: true, depositId: id, status: "PENDING" };
  },
});

export const listDeposits = defineTool({
  name: "list_deposits",
  title: "List broker deposits",
  description:
    "Broker deposits with totals. People who manage commission see everyone's (and can filter by staffId); others see the " +
    "deposits credited to them.",
  input: {
    status: z.enum(DEPOSIT_STATUSES).optional(),
    staffId: zId("Staff user").optional(),
    period: z.enum(LEADERBOARD_PERIODS).optional().describe("By deposit date; default all time"),
    ...zDays,
    page: zPageNo,
    pageSize: zPageSize,
  },
  routes: [crmRoutes.deposits],
  perms: ["crm.read"],
  kind: "read",
  async run({ status, staffId, period, from, to, page, pageSize }, { call }) {
    const r = await call(crmRoutes.deposits, {
      query: { status, staff: staffId, period, from, to, page: page ?? 1, pageSize: pageSize ?? 25 },
    });
    return {
      total: r.total,
      page: r.page,
      pageSize: r.pageSize,
      summary: r.summary,
      seesEveryone: r.manage,
      deposits: r.rows.map((d) => ({
        id: d.id,
        lead: d.lead,
        sequence: d.sequence,
        amountMinor: d.amountMinor,
        depositedAt: d.depositedAt,
        status: d.status,
        creditedTo: ref(d.creditedTo),
        loggedBy: ref(d.loggedBy),
        reference: d.reference,
        note: d.note,
        rejectReason: d.rejectReason,
        commissionPct: d.commissionPct,
        commissionMinor: d.commissionMinor,
        canDelete: d.canDelete,
      })),
    };
  },
});

export const verifyDeposit = defineTool({
  name: "verify_deposit",
  title: "Verify a deposit",
  description: "Mark a pending deposit as verified with the broker. Its commission is worked out and credited at this point.",
  input: { depositId: zId("Deposit") },
  routes: [crmRoutes.verifyDeposit],
  perms: ["crm.commission.manage"],
  kind: "write",
  async run({ depositId }, { call }) {
    return call(crmRoutes.verifyDeposit, { params: { id: depositId } });
  },
});

export const rejectDeposit = defineTool({
  name: "reject_deposit",
  title: "Reject a deposit",
  description: "Reject a deposit that the broker doesn't show, with a reason the credited person will see.",
  input: { depositId: zId("Deposit"), reason: z.string().trim().min(2).max(300) },
  routes: [crmRoutes.rejectDeposit],
  perms: ["crm.commission.manage"],
  kind: "destructive",
  async run({ depositId, reason }, { call }) {
    return call(crmRoutes.rejectDeposit, { params: { id: depositId }, body: { reason } });
  },
});

export const deleteDeposit = defineTool({
  name: "delete_deposit",
  title: "Delete a pending deposit",
  description: "Delete a deposit logged by mistake. Only pending ones, by whoever logged it, the credited person or a commission manager.",
  input: { depositId: zId("Deposit") },
  routes: [crmRoutes.deleteDeposit],
  perms: ["crm.write"],
  kind: "destructive",
  async run({ depositId }, { call }) {
    return call(crmRoutes.deleteDeposit, { params: { id: depositId } });
  },
});

export const listProducts = defineTool({
  name: "list_products",
  title: "List products",
  description: "Every product leads can be converted to, with the projects that sell it and conversions this month and in total.",
  input: {},
  routes: [crmRoutes.products],
  perms: ["crm.manage"],
  kind: "read",
  async run(_a, { call }) {
    return call(crmRoutes.products);
  },
});

const productFields = {
  description: z.string().trim().max(1000).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  isStudentCourse: z.boolean().optional().describe("Becoming a student counts as converting to this product (only one product can be it)"),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  projectIds: z.array(zId("Project")).max(200).optional().describe("Projects that sell it (the default project sells every product)"),
};

export const createProduct = defineTool({
  name: "create_product",
  title: "Create a product",
  description: "Add a product leads can be converted to.",
  input: { name: z.string().trim().min(2).max(80), ...productFields },
  routes: [crmRoutes.createProduct],
  perms: ["crm.manage"],
  kind: "write",
  async run(a, { call }) {
    const { id } = await call(crmRoutes.createProduct, { body: defined(a) });
    return { ok: true, productId: id };
  },
});

export const updateProduct = defineTool({
  name: "update_product",
  title: "Update a product",
  description: "Change a product. Send only what changes; projectIds replaces the list of projects that sell it.",
  input: { productId: zId("Product"), name: z.string().trim().min(2).max(80).optional(), ...productFields },
  routes: [crmRoutes.updateProduct],
  perms: ["crm.manage"],
  kind: "write",
  idempotent: true,
  async run({ productId, ...a }, { call }) {
    return call(crmRoutes.updateProduct, { params: { id: productId }, body: defined(a) });
  },
});

export const getStaffCommission = defineTool({
  name: "get_staff_commission",
  title: "A person's commission",
  description:
    "One salesperson's commission (this month, last month, all time), deposits, pending deposits, conversions and recent deposits.",
  input: { staffId: zId("Staff user") },
  routes: [crmRoutes.staffCommission],
  perms: ["crm.commission.manage"],
  kind: "read",
  async run({ staffId }, { call }) {
    return call(crmRoutes.staffCommission, { params: { id: staffId } });
  },
});

export const getCommissionRates = defineTool({
  name: "get_commission_rates",
  title: "Commission rates",
  description:
    "The commission rates: a percentage of first deposits, and slabs for later deposits picked by the person's monthly total " +
    "of verified later deposits (amounts in USD, rates in percent).",
  input: {},
  routes: [crmRoutes.commissionSettings],
  perms: ["crm.commission.manage"],
  kind: "read",
  async run(_a, { call }) {
    return call(crmRoutes.commissionSettings);
  },
});

export const setCommissionRates = defineTool({
  name: "set_commission_rates",
  title: "Change commission rates",
  description:
    "Replace the commission rates. firstPct applies to first deposits verified from now on. The slabs apply to this month at " +
    "once: everyone's verified later deposits this month are re-rated. Keep a slab from 0 (the base rate). Show the user " +
    "the old and new rates and confirm first.",
  input: {
    firstPct: z.number().min(0).max(100),
    slabs: z
      .array(z.object({ fromUsd: z.number().min(0), pct: z.number().min(0).max(100) }))
      .min(1)
      .max(10),
  },
  routes: [crmRoutes.saveCommissionSettings],
  perms: ["crm.commission.manage"],
  kind: "destructive",
  async run({ firstPct, slabs }, { call }) {
    return call(crmRoutes.saveCommissionSettings, { body: { firstPct, slabs: slabs.map((s) => ({ from: s.fromUsd, pct: s.pct })) } });
  },
});
