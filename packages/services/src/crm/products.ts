import type { LeadConversionDto, ProductDto, ProductInput } from "@edge/contracts";
import {
  CrmProduct,
  isDuplicateKey,
  Lead,
  LeadConversion,
  Types,
  withTx,
  type CrmProductDoc,
  type LeadConversionDoc,
  type LeadDoc,
} from "@edge/db";
import { now } from "@edge/domain/clock";
import type { ConversionSource, LeadStage } from "@edge/domain/crm/enums";
import type { Actor } from "@edge/domain/enums";
import { audit } from "../audit";
import { BusinessError, NotFoundError, TransitionError, ValidationError } from "../errors";
import { oid } from "../ids";
import { iso } from "../mappers";
import { notifyUser } from "../notifications/in-app";
import { actorId, escapeRegex, leadHref, loadLead, lockLead, productNames, recordActivity, startOfDubaiMonth, userNames } from "./common";
import { has, type CrmScope } from "./scope";

/** What the academy sells, inserted once by the seed; CRM admins rename, add and archive them afterwards. */
export const DEFAULT_PRODUCTS = [
  {
    code: "INNER-CIRCLE",
    name: "Inner Circle",
    description: "Opened an account with the affiliate broker (JetaFX) and deposited the minimum amount.",
    sortOrder: 10,
  },
  {
    code: "PREMIUM-COURSE",
    name: "Premium course",
    description: "Joined the premium course. Recorded automatically when the lead becomes a student.",
    sortOrder: 20,
    isStudentCourse: true,
  },
  { code: "WEALTH-CIRCLE", name: "Wealth Circle", description: "Premium online club.", sortOrder: 30 },
  { code: "F1-CLUB", name: "F1 Club", description: "Premium online club.", sortOrder: 40 },
] as const;

const toInt = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) return Number.isFinite(Number(v)) ? Number(v) : null;
  return null;
};

async function codeFor(name: string) {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "PRODUCT";
  let code = base;
  for (let i = 2; await CrmProduct.exists({ code }); i++) code = `${base.slice(0, 26)}-${i}`;
  return code;
}

/** Seed: insert the default products that are missing. Inserting the student course backfills existing students. */
export async function ensureDefaultProducts() {
  const studentCourseTaken = !!(await CrmProduct.exists({ isStudentCourse: true }));
  for (const p of DEFAULT_PRODUCTS) {
    const isStudentCourse = "isStudentCourse" in p && !studentCourseTaken;
    const r = await CrmProduct.updateOne(
      { code: p.code },
      {
        $setOnInsert: { code: p.code, name: p.name, description: p.description, sortOrder: p.sortOrder, status: "ACTIVE", isStudentCourse },
      },
      { upsert: true },
    );
    if (r.upsertedCount && isStudentCourse) await backfillStudentConversions();
  }
}

export async function listProducts(scope: CrmScope): Promise<ProductDto[]> {
  if (!has(scope, "crm.manage")) throw new NotFoundError("Product");
  const monthStart = startOfDubaiMonth(now());
  const [rows, counts] = await Promise.all([
    CrmProduct.find({}).sort({ status: 1, sortOrder: 1, name: 1 }).lean(),
    LeadConversion.aggregate<{ _id: Types.ObjectId; total: number; month: number }>([
      { $group: { _id: "$productId", total: { $sum: 1 }, month: { $sum: { $cond: [{ $gte: ["$convertedAt", monthStart] }, 1, 0] } } } },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  return rows.map((p) => ({
    id: String(p._id),
    name: p.name,
    code: p.code,
    description: p.description ?? null,
    status: p.status,
    isStudentCourse: !!p.isStudentCourse,
    sortOrder: p.sortOrder ?? 0,
    conversionsMonth: byId.get(String(p._id))?.month ?? 0,
    conversionsTotal: byId.get(String(p._id))?.total ?? 0,
    createdAt: iso(p.createdAt)!,
  }));
}

/** Active products, in menu order (dropdowns). */
export async function activeProducts() {
  const rows = await CrmProduct.find({ status: "ACTIVE" }, { name: 1 }).sort({ sortOrder: 1, name: 1 }).lean();
  return rows.map((p) => ({ id: String(p._id), name: p.name }));
}

export async function createProduct(input: ProductInput, actor: Actor & { type: "USER" }, scope: CrmScope) {
  if (!has(scope, "crm.manage")) throw new NotFoundError("Product");
  const name = input.name.trim();
  if (await CrmProduct.exists({ name: new RegExp(`^${escapeRegex(name)}$`, "i") }))
    throw new ValidationError({ name: "A product with this name already exists" });
  const code = await codeFor(name);
  const studentCourse = !!input.isStudentCourse;
  const id = await withTx(async () => {
    if (studentCourse) await CrmProduct.updateMany({ isStudentCourse: true }, { $set: { isStudentCourse: false } });
    const [p] = await CrmProduct.create([
      {
        name,
        code,
        description: input.description?.trim() || null,
        status: input.status ?? "ACTIVE",
        isStudentCourse: studentCourse,
        sortOrder: toInt(input.sortOrder) ?? 0,
        createdById: actorId(actor),
      },
    ]);
    await audit({
      actor,
      action: "product.create",
      entityType: "CrmProduct",
      entityId: String(p!._id),
      after: { name, code, isStudentCourse: studentCourse },
    });
    return p!._id;
  });
  if (studentCourse) await backfillStudentConversions();
  return String(id);
}

export async function updateProduct(id: string, input: Partial<ProductInput>, actor: Actor & { type: "USER" }, scope: CrmScope) {
  if (!has(scope, "crm.manage")) throw new NotFoundError("Product");
  const p = await CrmProduct.findById(oid(id, "Product")).lean();
  if (!p) throw new NotFoundError("Product");
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) set.name = input.name.trim();
  if (input.description !== undefined) set.description = input.description.trim() || null;
  if (input.status !== undefined) set.status = input.status;
  if (input.sortOrder !== undefined) set.sortOrder = toInt(input.sortOrder) ?? 0;
  if (input.isStudentCourse !== undefined) set.isStudentCourse = input.isStudentCourse;
  if (!Object.keys(set).length) return;
  const becomesStudentCourse = set.isStudentCourse === true && !p.isStudentCourse;
  await withTx(async () => {
    if (becomesStudentCourse)
      await CrmProduct.updateMany({ _id: { $ne: p._id }, isStudentCourse: true }, { $set: { isStudentCourse: false } });
    await CrmProduct.updateOne({ _id: p._id }, { $set: set });
    await audit({
      actor,
      action: "product.update",
      entityType: "CrmProduct",
      entityId: id,
      before: { name: p.name, status: p.status, isStudentCourse: p.isStudentCourse },
      after: set,
    });
  });
  if (becomesStudentCourse || (set.status === "ACTIVE" && p.status !== "ACTIVE" && p.isStudentCourse)) await backfillStudentConversions();
}

/**
 * Inside withTx, on a freshly read lead: record conversions to `products`, mirror them on the lead and mark it
 * CONVERTED if it was not. Credit goes to the owner (else the actor); `stageBefore` lets a removal reopen the lead.
 */
async function applyConversions(
  l: LeadDoc,
  products: CrmProductDoc[],
  o: { actor: Actor; source: ConversionSource; note: string | null; at: Date },
) {
  const credited = l.ownerId ?? actorId(o.actor);
  const stageBefore = l.stage === "CONVERTED" ? null : (l.stage as LeadStage);
  await LeadConversion.create(
    products.map((p) => ({
      leadId: l._id,
      productId: p._id,
      projectId: l.projectId,
      creditedToId: credited,
      convertedById: actorId(o.actor),
      source: o.source,
      stageBefore,
      note: o.note,
      convertedAt: o.at,
    })),
    { ordered: true },
  );
  const set: Record<string, unknown> = { lastActivityAt: o.at };
  if (l.stage !== "CONVERTED") Object.assign(set, { stage: "CONVERTED", stageChangedAt: o.at });
  if (!l.convertedAt) Object.assign(set, { convertedAt: o.at, convertedById: actorId(o.actor) });
  await Lead.updateOne({ _id: l._id }, { $set: set, $addToSet: { productIds: { $each: products.map((p) => p._id) } } });
  await recordActivity(l._id, "PRODUCT_CONVERTED", o.actor, {
    body: o.note,
    data: {
      products: products.map((p) => ({ id: String(p._id), name: p.name })),
      source: o.source,
      fromStage: stageBefore,
      creditedToId: credited ? String(credited) : null,
    },
  });
  return credited;
}

/** Staff mark a lead as converted to one or more products (each at most once per lead). */
export async function markConversions(
  leadId: string,
  input: { productIds: string[]; note?: string },
  actor: Actor & { type: "USER" },
  scope: CrmScope,
) {
  const lead = await loadLead(leadId, scope);
  if (lead.mergedIntoId) throw new TransitionError("This lead was merged into another lead");
  const ids = [...new Set(input.productIds)].map((p) => oid(p, "Product"));
  const products = await CrmProduct.find({ _id: { $in: ids }, status: "ACTIVE" })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  if (products.length !== ids.length) throw new ValidationError({ productIds: "Choose active products only" });
  const note = input.note?.trim() || null;
  const at = now();
  let added: CrmProductDoc[] = [];
  try {
    added = await withTx(async () => {
      const l = await lockLead(lead._id);
      const have = new Set((l.productIds ?? []).map(String));
      const fresh = (products as CrmProductDoc[]).filter((p) => !have.has(String(p._id)));
      if (!fresh.length) return [];
      const credited = await applyConversions(l, fresh, { actor, source: "MANUAL", note, at });
      await audit({
        actor,
        action: "lead.conversion.add",
        entityType: "Lead",
        entityId: leadId,
        after: { productIds: fresh.map((p) => String(p._id)), creditedToId: credited ? String(credited) : null },
      });
      if (credited && String(credited) !== actor.id)
        await notifyUser(String(credited), {
          title: `${l.name} converted`,
          body: `Marked as ${fresh.map((p) => p.name).join(", ")}. It counts for you.`,
          href: leadHref(l._id),
        });
      return fresh;
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new BusinessError("This lead is already converted to that product");
    throw e;
  }
  if (!added.length) throw new BusinessError("This lead is already converted to the chosen products");
  return added.length;
}

/** Undo a conversion (crm.manage). Removing the last one reopens the lead at the stage it had, unless it is a student. */
export async function removeConversion(id: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  if (!has(scope, "crm.manage")) throw new NotFoundError("Conversion");
  const c = await LeadConversion.findById(oid(id, "Conversion")).lean();
  if (!c) throw new NotFoundError("Conversion");
  const lead = await loadLead(c.leadId, scope);
  const product = await CrmProduct.findById(c.productId, { name: 1 }).lean();
  const at = now();
  await withTx(async () => {
    const l = await lockLead(lead._id);
    const r = await LeadConversion.deleteOne({ _id: c._id });
    if (r.deletedCount !== 1) throw new NotFoundError("Conversion");
    const rest = await LeadConversion.find({ leadId: l._id }).sort({ convertedAt: 1, _id: 1 }).lean();
    const set: Record<string, unknown> = { lastActivityAt: at };
    if (!rest.length && !l.studentId) {
      Object.assign(set, { stage: c.stageBefore ?? "QUALIFIED", stageChangedAt: at, convertedAt: null, convertedById: null });
    } else if (c.stageBefore && rest[0] && !rest[0].stageBefore) {
      // Keep the pre-conversion stage on the earliest remaining conversion.
      await LeadConversion.updateOne({ _id: rest[0]._id }, { $set: { stageBefore: c.stageBefore } });
    }
    await Lead.updateOne({ _id: l._id }, { $set: set, $pull: { productIds: c.productId } });
    await recordActivity(l._id, "CONVERSION_REMOVED", actor, {
      data: {
        product: { id: String(c.productId), name: product?.name ?? "Unknown product" },
        toStage: (set.stage as string | undefined) ?? null,
      },
    });
    await audit({
      actor,
      action: "lead.conversion.remove",
      entityType: "Lead",
      entityId: String(l._id),
      before: { productId: String(c.productId), creditedToId: c.creditedToId ? String(c.creditedToId) : null },
    });
  });
}

/**
 * A lead that just became a student (convert, link, auto-link, created for an existing student) converts to the
 * student-course product. Joins the surrounding transaction when there is one; a repeat is a no-op.
 */
export async function recordStudentConversion(leadId: Types.ObjectId, actor: Actor, at = now()) {
  const product = await CrmProduct.findOne({ isStudentCourse: true, status: "ACTIVE" }).lean();
  if (!product) return false;
  const l = (await Lead.findById(leadId).lean()) as LeadDoc | null;
  if (!l || l.mergedIntoId || (l.productIds ?? []).some((p) => p.equals(product._id))) return false;
  await applyConversions(l, [product as CrmProductDoc], { actor, source: "STUDENT", note: null, at });
  return true;
}

/** Students without a conversion to the student course get one, dated when they converted (no timeline entry). */
export async function backfillStudentConversions() {
  const product = await CrmProduct.findOne({ isStudentCourse: true, status: "ACTIVE" }).lean();
  if (!product) return 0;
  const leads = await Lead.find(
    { studentId: { $ne: null }, mergedIntoId: null, productIds: { $ne: product._id } },
    { projectId: 1, ownerId: 1, convertedAt: 1, convertedById: 1, createdAt: 1 },
  ).lean();
  for (const l of leads) {
    try {
      await LeadConversion.create([
        {
          leadId: l._id,
          productId: product._id,
          projectId: l.projectId,
          creditedToId: l.ownerId ?? l.convertedById ?? null,
          convertedById: l.convertedById ?? null,
          source: "STUDENT",
          convertedAt: l.convertedAt ?? l.createdAt,
        },
      ]);
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
    }
    await Lead.updateOne({ _id: l._id }, { $addToSet: { productIds: product._id } });
  }
  return leads.length;
}

export async function toConversionDtos(rows: LeadConversionDoc[]): Promise<LeadConversionDto[]> {
  if (!rows.length) return [];
  const [products, names] = await Promise.all([productNames(), userNames(rows.flatMap((c) => [c.creditedToId, c.convertedById]))]);
  const ref = (id: Types.ObjectId | null | undefined) => (id ? { id: String(id), name: names.get(String(id)) ?? "Unknown" } : null);
  return rows.map((c) => ({
    id: String(c._id),
    product: { id: String(c.productId), name: products.get(String(c.productId)) ?? "Unknown product" },
    creditedTo: ref(c.creditedToId),
    convertedBy: ref(c.convertedById),
    source: c.source,
    note: c.note ?? null,
    convertedAt: iso(c.convertedAt)!,
  }));
}

/** Move a merged lead's conversions to the survivor (inside withTx); a product both had keeps the earlier one. */
export async function moveConversions(fromId: Types.ObjectId, intoId: Types.ObjectId, intoProjectId: Types.ObjectId) {
  const [from, into] = await Promise.all([LeadConversion.find({ leadId: fromId }).lean(), LeadConversion.find({ leadId: intoId }).lean()]);
  const intoBy = new Map(into.map((c) => [String(c.productId), c]));
  for (const c of from) {
    const twin = intoBy.get(String(c.productId));
    if (!twin) {
      await LeadConversion.updateOne({ _id: c._id }, { $set: { leadId: intoId, projectId: intoProjectId } });
    } else if (c.convertedAt < twin.convertedAt) {
      await LeadConversion.deleteOne({ _id: twin._id });
      await LeadConversion.updateOne({ _id: c._id }, { $set: { leadId: intoId, projectId: intoProjectId } });
    } else {
      await LeadConversion.deleteOne({ _id: c._id });
    }
  }
  const productIds = await LeadConversion.distinct("productId", { leadId: intoId });
  return productIds as Types.ObjectId[];
}
