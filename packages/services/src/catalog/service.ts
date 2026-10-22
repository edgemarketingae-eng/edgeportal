import type { BatchInput, CourseInput } from "@edge/contracts";
import { AuthUser, Batch, Course, Enrollment, isDuplicateKey, Role, StaffProfile, Types, withTx, type BatchDoc } from "@edge/db";
import type { Actor } from "@edge/domain/enums";
import { toMinor } from "@edge/domain/money";
import type { z } from "zod";
import { audit } from "../audit";
import { BusinessError, NotFoundError } from "../errors";
import { oid } from "../ids";
import { toBatchDto } from "../mappers";

export function parsePresets(raw: string): number[] {
  if (!raw.trim()) return [];
  return [...new Set(raw.split(/[,\s]+/).filter(Boolean).map((v) => toMinor(v)))].filter((v) => v > 0).sort((a, b) => a - b);
}

export async function saveCourse(id: string | null, input: z.output<typeof CourseInput>, actor: Actor) {
  const data = { code: input.code, slug: input.code.toLowerCase(), title: input.title, description: input.description || null, isActive: input.isActive };
  try {
    const course = id ? await Course.findByIdAndUpdate(oid(id, "Course"), { $set: data }, { returnDocument: "after" }).lean() : (await Course.create(data)).toObject();
    if (!course) throw new NotFoundError("Course");
    await audit({ actor, action: id ? "course.update" : "course.create", entityType: "Course", entityId: String(course._id), after: data });
    return String(course._id);
  } catch (e) {
    if (isDuplicateKey(e)) throw new BusinessError("This code is already used", { code: "This code is already used" });
    throw e;
  }
}

export async function saveBatch(id: string | null, b: z.output<typeof BatchInput>, actor: Actor) {
  const presets = parsePresets(b.advancePresets);
  if (b.advanceEnabled && presets.length === 0) throw new BusinessError("Add at least one advance amount, or turn advance payments off", { advancePresets: "Add at least one amount" });
  if (presets.some((p) => p >= b.fee)) throw new BusinessError("Advance amounts must be lower than the course fee", { advancePresets: "Must be lower than the fee" });
  const courseId = oid(b.courseId, "Course");
  if (!(await Course.exists({ _id: courseId }))) throw new NotFoundError("Course");
  const mentorIds = b.mentorIds.map((m) => oid(m, "Mentor"));
  const data = {
    courseId,
    code: b.code,
    name: b.name,
    description: b.description || null,
    startDate: new Date(`${b.startDate}T00:00:00Z`),
    endDate: b.endDate ? new Date(`${b.endDate}T00:00:00Z`) : null,
    scheduleText: b.scheduleText || null,
    capacity: b.capacity ?? null,
    status: b.status,
    feeMinor: b.fee,
    advanceEnabled: b.advanceEnabled,
    advancePresetsMinor: presets,
    allowCustomAdvance: b.allowCustomAdvance,
    balanceDueRule: b.balanceDueRule,
    balanceDueDate: b.balanceDueDate ? new Date(`${b.balanceDueDate}T00:00:00Z`) : null,
    balanceDueDays: b.balanceDueDays ?? null,
    lockGraceDays: b.lockGraceDays,
    whatsappGroupUrl: b.whatsappGroupUrl || null,
    isCurrentForEnrollment: b.isCurrentForEnrollment,
    mentors: mentorIds.map((userId, i) => ({ userId, isLead: i === 0 })),
  };
  try {
    const savedId = await withTx(async () => {
      if (b.isCurrentForEnrollment) {
        await Batch.updateMany({ courseId, isCurrentForEnrollment: true, ...(id ? { _id: { $ne: oid(id) } } : {}) }, { $set: { isCurrentForEnrollment: false } });
      }
      let savedId: string;
      if (id) {
        const updated = await Batch.findByIdAndUpdate(oid(id, "Batch"), { $set: data }, { returnDocument: "after" }).lean();
        if (!updated) throw new NotFoundError("Batch");
        savedId = String(updated._id);
      } else {
        const created = await new Batch(data).save(); // session attached by transactionAsyncLocalStorage
        savedId = String(created._id);
      }
      await audit({ actor, action: id ? "batch.update" : "batch.create", entityType: "Batch", entityId: savedId, after: { ...data, mentorIds: b.mentorIds } });
      return savedId;
    });
    return savedId;
  } catch (e) {
    if (isDuplicateKey(e)) throw new BusinessError("This code is already used, or another admin just changed the current batch", { code: "This code may already be used" });
    throw e;
  }
}

/** Staff who can host classes (own or any batch). */
export async function listMentors() {
  const roleIds = (await Role.find({ permissions: { $in: ["class.schedule.own", "class.schedule.any"] } }, { _id: 1 }).lean()).map((r) => r._id);
  const staff = await StaffProfile.find({ roleIds: { $in: roleIds } }).lean();
  const users = await AuthUser.find({ _id: { $in: staff.map((s) => s._id) }, disabledAt: null }).sort({ name: 1 }).lean();
  const title = new Map(staff.map((s) => [String(s._id), s.title ?? null]));
  return users.map((u) => ({ userId: String(u._id), name: u.name, title: title.get(String(u._id)) ?? null }));
}

export async function mentorNameMap(batches: BatchDoc[]) {
  const ids = [...new Set(batches.flatMap((b) => (b.mentors ?? []).map((m) => String(m.userId))))].map((x) => new Types.ObjectId(x));
  const [users, staff] = await Promise.all([AuthUser.find({ _id: { $in: ids } }, { name: 1 }).lean(), StaffProfile.find({ _id: { $in: ids } }, { title: 1 }).lean()]);
  const titles = new Map(staff.map((s) => [String(s._id), s.title ?? null]));
  return new Map(users.map((u) => [String(u._id), { name: u.name, title: titles.get(String(u._id)) ?? null }]));
}

export async function listCourses() {
  const [courses, batches, counts] = await Promise.all([
    Course.find().sort({ createdAt: 1 }).lean(),
    Batch.find().sort({ startDate: -1 }).lean(),
    Enrollment.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { status: { $in: ["ACTIVE", "PENDING_APPROVAL", "LOCKED"] } } }, { $group: { _id: "$batchId", n: { $sum: 1 } } }]),
  ]);
  const names = await mentorNameMap(batches);
  const count = new Map(counts.map((c) => [String(c._id), c.n]));
  return courses.map((c) => ({
    id: String(c._id),
    code: c.code,
    slug: c.slug,
    title: c.title,
    description: c.description ?? null,
    isActive: c.isActive ?? true,
    batches: batches.filter((b) => String(b.courseId) === String(c._id)).map((b) => toBatchDto(b, c.title, names, count.get(String(b._id)) ?? 0)),
  }));
}

export async function listBatches() {
  const [batches, courses] = await Promise.all([Batch.find({ status: { $ne: "ARCHIVED" } }).sort({ startDate: -1 }).lean(), Course.find().lean()]);
  const names = await mentorNameMap(batches);
  const titles = new Map(courses.map((c) => [String(c._id), c.title]));
  return batches.map((b) => toBatchDto(b, titles.get(String(b.courseId)) ?? "", names));
}

export async function getBatch(id: string) {
  const b = await Batch.findById(oid(id, "Batch")).lean();
  if (!b) throw new NotFoundError("Batch");
  const course = await Course.findById(b.courseId).lean();
  return toBatchDto(b, course?.title ?? "", await mentorNameMap([b]));
}
