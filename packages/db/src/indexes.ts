import type { Model } from "mongoose";
import { AuthAccount, AuthRateLimit, AuthSession, AuthTwoFactor, AuthUser, AuthVerification } from "./models/auth";
import { Batch, Course } from "./models/catalog";
import { ClassSession, JoinLog, MeetEvent, Recording, RecordingView } from "./models/classes";
import { Enrollment, EnrollmentEvent } from "./models/enrollment";
import { AuditLog, InAppNotification, JobOutbox, NotificationLog, OtpThrottle } from "./models/ops";
import { FeeRate, OdooSyncLog, Payment, PaymentEvent, Setting } from "./models/payments";
import { Role, StaffProfile, StudentProfile } from "./models/people";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_MODELS: Model<any>[] = [
  AuthUser,
  AuthSession,
  AuthAccount,
  AuthVerification,
  AuthTwoFactor,
  AuthRateLimit,
  Role,
  StaffProfile,
  StudentProfile,
  Course,
  Batch,
  Enrollment,
  EnrollmentEvent,
  Payment,
  PaymentEvent,
  FeeRate,
  Setting,
  OdooSyncLog,
  MeetEvent,
  ClassSession,
  Recording,
  JoinLog,
  RecordingView,
  NotificationLog,
  InAppNotification,
  AuditLog,
  OtpThrottle,
  JobOutbox,
];

/**
 * Creates collections (transactions cannot create them) and the indexes declared on each schema.
 * Uses createIndexes(), never syncIndexes(): syncIndexes would drop indexes Better Auth adds itself.
 */
export async function ensureIndexes() {
  for (const m of ALL_MODELS) {
    await m.createCollection().catch((e: { code?: number }) => {
      if (e.code !== 48) throw e; // NamespaceExists
    });
    await m.createIndexes();
  }
}
