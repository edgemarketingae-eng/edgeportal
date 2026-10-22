import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { Recording } from "@edge/db";
import { now } from "@edge/domain/clock";
import { env } from "../env";
import { oid } from "../ids";
import { workspaceRoot } from "../paths";
import { runtime } from "../runtime";

const run = promisify(execFile);
const FILL_STALE_MS = 60 * 60_000;

/**
 * Local disk cache for Drive recordings. Each file is downloaded from Drive ONCE (by the worker),
 * then every viewer's seek/range request is served from disk by the API. This avoids Drive's
 * per-file download quota. API and worker must share MEDIA_CACHE_DIR (one volume in compose).
 */
export function cacheDir() {
  return env.MEDIA_CACHE_DIR ? path.resolve(env.MEDIA_CACHE_DIR) : path.join(workspaceRoot(), ".media-cache");
}

export function cachePathFor(recordingId: string) {
  return path.join(cacheDir(), `${recordingId}.mp4`);
}

async function hasFfmpeg() {
  try {
    await run("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/** Queue a cache fill outside any transaction. Deduplicated in BullMQ while one is pending. */
export async function requestCacheFill(recordingId: string) {
  await runtime()
    .producer.send("recordings.cacheFill", { recordingId }, { dedupeId: `cache-${recordingId}` })
    .catch((e) => console.error("[cache] enqueue failed", recordingId, (e as Error).message));
}

export async function fillCache(recordingId: string) {
  const id = oid(recordingId, "Recording");
  const r = await Recording.findById(id).lean();
  if (!r) return { skipped: "missing" };
  let vanished = false;
  if (r.cache?.state === "READY" && r.cache.path) {
    try {
      await stat(r.cache.path);
      return { skipped: "ready" };
    } catch {
      vanished = true; // file deleted under us; refill
    }
  }
  // Claim: only one filler per recording; a filler that died over an hour ago can be taken over.
  const claimable: Record<string, unknown>[] = [
    { "cache.state": { $in: ["NONE", "EVICTED", "ERROR"] } },
    { "cache.state": "FILLING", "cache.claimedAt": { $lt: new Date(now().getTime() - FILL_STALE_MS) } },
  ];
  if (vanished) claimable.push({ "cache.state": "READY", "cache.path": r.cache!.path });
  const claimed = await Recording.findOneAndUpdate({ _id: id, $or: claimable }, { $set: { "cache.state": "FILLING", "cache.claimedAt": now(), lastError: null } }).lean();
  if (!claimed) return { skipped: "already filling" };

  await mkdir(cacheDir(), { recursive: true });
  const tmp = path.join(cacheDir(), `${recordingId}.download`);
  const final = cachePathFor(recordingId);
  try {
    const dl = await runtime().google.downloadDriveFile(r.driveAccessEmail ?? env.GOOGLE_DEFAULT_ORGANIZER ?? "", r.driveFileId);
    await pipeline(Readable.fromWeb(dl.body as never), createWriteStream(tmp));

    let durationSec = r.durationSec ?? null;
    if (await hasFfmpeg()) {
      // Move the MP4 index to the front so playback/seeking starts instantly (no re-encode).
      const fast = `${tmp}.faststart.mp4`;
      try {
        await run("ffmpeg", ["-y", "-v", "error", "-i", tmp, "-c", "copy", "-movflags", "+faststart", fast], { timeout: 30 * 60_000 });
        await rename(fast, tmp);
        const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", tmp]);
        durationSec = Math.round(Number(stdout.trim())) || durationSec;
      } catch {
        await rm(fast, { force: true }); // serve the original bytes
      }
    }
    await rename(tmp, final);
    const size = (await stat(final)).size;
    await Recording.updateOne(
      { _id: id },
      { $set: { "cache.state": "READY", "cache.path": final, "cache.cachedAt": now(), "cache.claimedAt": null, sizeBytes: size, durationSec, lastError: null } },
    );
    return { ready: true, size };
  } catch (e) {
    await rm(tmp, { force: true });
    await Recording.updateOne({ _id: id }, { $set: { "cache.state": "ERROR", "cache.claimedAt": null, lastError: String(e).slice(0, 1000) } });
    throw e;
  }
}

/** Keep the cache under MEDIA_CACHE_MAX_GB, evicting least recently served files first. */
export async function evictCache(maxBytes = env.MEDIA_CACHE_MAX_GB * 1024 ** 3) {
  const ready = await Recording.find({ "cache.state": "READY" }, { sizeBytes: 1, cache: 1 }).sort({ "cache.lastServedAt": 1 }).lean();
  let total = ready.reduce((s, r) => s + (r.sizeBytes ?? 0), 0);
  const recentCutoff = new Date(now().getTime() - 60 * 60_000);
  let evicted = 0;
  for (const r of ready) {
    if (total <= maxBytes) break;
    if (r.cache?.lastServedAt && r.cache.lastServedAt > recentCutoff) continue; // someone is watching
    const res = await Recording.updateOne({ _id: r._id, "cache.state": "READY" }, { $set: { "cache.state": "EVICTED", "cache.path": null } });
    if (!res.modifiedCount) continue;
    if (r.cache?.path) await rm(r.cache.path, { force: true });
    total -= r.sizeBytes ?? 0;
    evicted++;
  }
  // Remove orphaned partial downloads older than a day
  try {
    for (const f of await readdir(cacheDir())) {
      if (!f.endsWith(".download") && !f.endsWith(".faststart.mp4")) continue;
      const p = path.join(cacheDir(), f);
      if ((await stat(p)).mtimeMs < Date.now() - 86_400_000) await rm(p, { force: true });
    }
  } catch {
    // cache dir may not exist yet
  }
  return { evicted, totalBytes: total };
}

/** Throttled "someone is watching" marker so eviction skips files in use. */
const lastTouch = new Map<string, number>();
export async function touchServed(recordingId: string) {
  const t = Date.now();
  if ((lastTouch.get(recordingId) ?? 0) > t - 60_000) return;
  lastTouch.set(recordingId, t);
  await Recording.updateOne({ _id: oid(recordingId) }, { $set: { "cache.lastServedAt": new Date(t) } });
}

export async function markCacheMissing(recordingId: string) {
  await Recording.updateOne({ _id: oid(recordingId), "cache.state": "READY" }, { $set: { "cache.state": "EVICTED", "cache.path": null } });
}
