import { createHash, randomBytes } from "node:crypto";
import { CrmDevice, Types, withTx, type CrmDeviceDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import type { Actor } from "@edge/domain/enums";
import { audit } from "../audit";
import { NotFoundError } from "../errors";
import { oid } from "../ids";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface DeviceInfo {
  model?: string;
  androidVersion?: string;
  appVersion?: string;
}

/** A phone is only touched this often, so ordinary requests don't each write to the database. */
const SEEN_EVERY_MS = 5 * 60_000;

/**
 * Signs a phone in and returns its token, which exists only on the phone from here on. A person has one live device, so
 * signing in on a new phone retires the old one. The token doesn't expire: a tracker that quietly stops after a month is
 * worse than a long-lived token that can be revoked.
 */
export async function registerDevice(userId: string, info: DeviceInfo): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const _id = new Types.ObjectId();
  const at = now();
  await withTx(async () => {
    await retire(new Types.ObjectId(userId), "replaced", at);
    await CrmDevice.create([
      {
        _id,
        userId: new Types.ObjectId(userId),
        tokenHash: hashToken(token),
        model: info.model || null,
        androidVersion: info.androidVersion || null,
        appVersion: info.appVersion || null,
        lastSeenAt: at,
      },
    ]);
    await audit({ actor: { type: "USER", id: userId }, action: "device.register", entityType: "CrmDevice", entityId: String(_id) });
  });
  return token;
}

function retire(userId: Types.ObjectId, reason: string, at: Date) {
  return CrmDevice.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: at, revokedReason: reason, fcmToken: null } });
}

export async function findDeviceByToken(token: string): Promise<CrmDeviceDoc | null> {
  return (await CrmDevice.findOne({ tokenHash: hashToken(token), revokedAt: null }).lean()) as CrmDeviceDoc | null;
}

export async function markDeviceSeen(device: Pick<CrmDeviceDoc, "_id" | "lastSeenAt">) {
  const at = now();
  if (device.lastSeenAt && at.getTime() - device.lastSeenAt.getTime() < SEEN_EVERY_MS) return;
  await CrmDevice.updateOne({ _id: device._id }, { $set: { lastSeenAt: at } });
}

/** Called whenever someone's password changes or their account is disabled (joins a surrounding transaction). */
export async function revokeDevices(userId: string | Types.ObjectId, reason: string) {
  await retire(oid(userId, "User"), reason, now());
}

export async function signOutDevice(deviceId: Types.ObjectId, actor: Actor) {
  await CrmDevice.updateOne({ _id: deviceId }, { $set: { revokedAt: now(), revokedReason: "signed_out", fcmToken: null } });
  await audit({ actor, action: "device.signOut", entityType: "CrmDevice", entityId: String(deviceId) });
}

/** A manager takes a lost phone off the team. Its token stops working on the next request. */
export async function removeDevice(id: string, actor: Actor) {
  const _id = oid(id, "Phone");
  const r = await CrmDevice.updateOne({ _id, revokedAt: null }, { $set: { revokedAt: now(), revokedReason: "removed", fcmToken: null } });
  if (!r.matchedCount) throw new NotFoundError("Phone");
  await audit({ actor, action: "device.remove", entityType: "CrmDevice", entityId: id });
}

export async function saveDeviceFcmToken(deviceId: Types.ObjectId, fcmToken: string | null) {
  await CrmDevice.updateOne({ _id: deviceId }, { $set: { fcmToken } });
}

/** What each background run reports, which is how a manager can see tracking has stopped. */
export async function recordDeviceSync(deviceId: Types.ObjectId, report: { trackingOn: boolean; appVersion?: string }) {
  await CrmDevice.updateOne(
    { _id: deviceId },
    { $set: { trackingOn: report.trackingOn, lastSyncAt: now(), ...(report.appVersion ? { appVersion: report.appVersion } : {}) } },
  );
}
