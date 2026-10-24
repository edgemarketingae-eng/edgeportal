import { StudentProfile } from "@edge/db";
import { isCountryCode } from "@edge/domain/countries";
import type { Actor } from "@edge/domain/enums";
import { audit } from "../audit";
import { NotFoundError, ValidationError } from "../errors";
import { oid } from "../ids";

/**
 * Correct a student's country of residence. It decides VAT and payment methods for checkouts from now on; an
 * enrollment that already has a payment keeps the tax treatment it was locked to.
 */
export async function setStudentCountry(studentId: string, country: string, actor: Actor) {
  const code = country.trim().toUpperCase();
  if (!isCountryCode(code)) throw new ValidationError({ country: "Choose a valid country" });
  const _id = oid(studentId, "Student");
  const profile = await StudentProfile.findById(_id, { country: 1 }).lean();
  if (!profile) throw new NotFoundError("Student");
  if (profile.country === code) return;
  await StudentProfile.updateOne({ _id }, { $set: { country: code } });
  await audit({
    actor,
    action: "student.country",
    entityType: "User",
    entityId: studentId,
    before: { country: profile.country ?? null },
    after: { country: code },
  });
}
