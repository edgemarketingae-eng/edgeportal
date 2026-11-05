import { Batch, ClassSession, Course, Enrollment, Lead, Project, Recording, type BatchDoc, type CourseDoc } from "@edge/db";
import { NotFoundError } from "../errors";
import { oid } from "../ids";
import { auditDelete, consoleUrl, deleter, gather, Plan, plural, snapshot } from "../records/kit";

/** A course with no batches. Leads and projects that named it as their interest just lose that link. */
export const courseDeleter = deleter<CourseDoc>({
  load: async (id) => {
    const c = await Course.findById(oid(id, "Course")).lean();
    if (!c) throw new NotFoundError("Course");
    return c as CourseDoc;
  },
  plan: async (c) => {
    const p = new Plan(`the course ${c.title}`);
    const [batches, leads, projects] = await gather([
      () => Batch.countDocuments({ courseId: c._id }),
      () => Lead.countDocuments({ courseInterestId: c._id }),
      () => Project.countDocuments({ courseId: c._id }),
    ] as const);
    p.blockIf(batches, "batch. Delete it first", "batches. Delete them first", consoleUrl("/admin/batches"));
    if (leads) p.warn(`${plural(leads, "lead lists", "leads list")} it as their course interest. That's cleared.`);
    if (projects) p.warn(`${plural(projects, "CRM project is", "CRM projects are")} linked to it. That link is cleared.`);
    return p;
  },
  apply: async (c, actor) => {
    await Lead.updateMany({ courseInterestId: c._id }, { $set: { courseInterestId: null } });
    await Project.updateMany({ courseId: c._id }, { $set: { courseId: null } });
    await Course.deleteOne({ _id: c._id });
    await auditDelete({ actor, action: "course.delete", entityType: "Course", entityId: String(c._id), before: snapshot(c) });
  },
  done: (c) => `${c.title} deleted.`,
});

/** A batch nobody enrolled in, with no classes or recordings, that isn't the one new students join. */
export const batchDeleter = deleter<BatchDoc>({
  load: async (id) => {
    const b = await Batch.findById(oid(id, "Batch")).lean();
    if (!b) throw new NotFoundError("Batch");
    return b as BatchDoc;
  },
  plan: async (b) => {
    const p = new Plan(`the batch ${b.name}`);
    const href = consoleUrl(`/admin/batches/${b._id}`);
    if (b.isCurrentForEnrollment) p.block("New students join this batch. Make another batch current first", href);
    const [enrollments, classes, recordings, leads, projects] = await gather([
      () => Enrollment.countDocuments({ batchId: b._id }),
      () => ClassSession.countDocuments({ batchId: b._id }),
      () => Recording.countDocuments({ batchId: b._id }),
      () => Lead.countDocuments({ batchInterestId: b._id }),
      () => Project.countDocuments({ batchId: b._id }),
    ] as const);
    p.blockIf(enrollments, "enrollment", "enrollments", consoleUrl(`/admin/students?batch=${b._id}`))
      .blockIf(classes, "class", "classes", consoleUrl("/staff/classes"))
      .blockIf(recordings, "recording", "recordings", consoleUrl("/staff/recordings"));
    if (leads) p.warn(`${plural(leads, "lead lists", "leads list")} it as their batch interest. That's cleared.`);
    if (projects) p.warn(`${plural(projects, "CRM project is", "CRM projects are")} linked to it. That link is cleared.`);
    return p;
  },
  apply: async (b, actor) => {
    await Lead.updateMany({ batchInterestId: b._id }, { $set: { batchInterestId: null } });
    await Project.updateMany({ batchId: b._id }, { $set: { batchId: null } });
    await Batch.deleteOne({ _id: b._id });
    await auditDelete({ actor, action: "batch.delete", entityType: "Batch", entityId: String(b._id), before: snapshot(b) });
  },
  done: (b) => `${b.name} deleted.`,
});
