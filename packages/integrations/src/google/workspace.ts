import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { JWT } from "google-auth-library";

/**
 * Google Workspace access through a service account with domain-wide delegation.
 * We impersonate the organizer (mentor or host account) for Calendar, Meet and Drive.
 * Plain REST via fetch keeps the dependency small.
 */
export const SCOPES = {
  calendar: "https://www.googleapis.com/auth/calendar.events",
  meetSettings: "https://www.googleapis.com/auth/meetings.space.settings",
  meetRead: "https://www.googleapis.com/auth/meetings.space.readonly",
  drive: "https://www.googleapis.com/auth/drive.readonly",
} as const;

export class GoogleError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface CreatedMeetEvent {
  calendarEventId: string;
  joinUrl: string;
  meetingCode: string | null;
}

export interface SpaceInfo {
  name: string; // spaces/xyz
  meetingCode: string | null;
  meetingUri: string | null;
}

export interface MeetRecording {
  name: string; // conferenceRecords/x/recordings/y
  state: string; // STARTED | ENDED | FILE_GENERATED
  startTime: string | null;
  endTime: string | null;
  driveFileId: string | null;
}

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSec: number | null;
}

export interface DriveDownload {
  status: number; // 200 or 206
  body: ReadableStream<Uint8Array>;
  headers: { contentLength?: string | null; contentRange?: string | null; contentType?: string | null };
}

export interface GoogleWorkspace {
  readonly isMock: boolean;
  createMeetEvent(
    organizer: string,
    input: { title: string; description?: string; start: Date; end: Date; requestId: string; attendees?: string[] },
  ): Promise<CreatedMeetEvent>;
  updateEvent(organizer: string, eventId: string, input: { title?: string; description?: string; start?: Date; end?: Date }): Promise<void>;
  cancelEvent(organizer: string, eventId: string): Promise<void>;
  configureSpace(
    organizer: string,
    meetingCode: string,
    opts: { accessType: "OPEN" | "TRUSTED" | "RESTRICTED"; autoRecord: boolean },
  ): Promise<SpaceInfo>;
  listRecordings(organizer: string, spaceName: string): Promise<MeetRecording[]>;
  getDriveFile(asUser: string, fileId: string): Promise<DriveFileMeta>;
  downloadDriveFile(asUser: string, fileId: string, range?: string | null): Promise<DriveDownload>;
}

export interface GoogleConfig {
  mode: "mock" | "sandbox" | "live";
  serviceAccountJson?: string;
  timeZone: string;
  mockDriveFile?: string;
}

function parseServiceAccount(raw: string | undefined) {
  if (!raw) throw new GoogleError("GOOGLE_SERVICE_ACCOUNT_JSON is not configured", 500);
  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const sa = JSON.parse(json) as { client_email: string; private_key: string };
  return sa;
}

class LiveGoogleWorkspace implements GoogleWorkspace {
  readonly isMock = false;
  private sa: { client_email: string; private_key: string };
  constructor(private cfg: GoogleConfig) {
    this.sa = parseServiceAccount(cfg.serviceAccountJson);
  }
  private clients = new Map<string, JWT>();

  private async token(subject: string, scopes: string[]) {
    const key = `${subject}|${scopes.join(" ")}`;
    let c = this.clients.get(key);
    if (!c) {
      c = new JWT({ email: this.sa.client_email, key: this.sa.private_key, scopes, subject });
      this.clients.set(key, c);
    }
    const { token } = await c.getAccessToken();
    if (!token) throw new GoogleError(`No access token for ${subject}`, 401);
    return token;
  }

  private async api<T>(subject: string, scopes: string[], url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.token(subject, scopes)}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
    if (!res.ok)
      throw new GoogleError(
        `Google ${init.method ?? "GET"} ${url.split("?")[0]} failed (${res.status}): ${(await res.text()).slice(0, 400)}`,
        res.status,
      );
    return (res.status === 204 ? null : await res.json()) as T;
  }

  async createMeetEvent(
    organizer: string,
    input: { title: string; description?: string; start: Date; end: Date; requestId: string; attendees?: string[] },
  ) {
    const body = {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.start.toISOString(), timeZone: this.cfg.timeZone },
      end: { dateTime: input.end.toISOString(), timeZone: this.cfg.timeZone },
      attendees: input.attendees?.map((email) => ({ email })),
      guestsCanSeeOtherGuests: false,
      guestsCanInviteOthers: false,
      conferenceData: { createRequest: { requestId: input.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    };
    const ev = await this.api<{
      id: string;
      hangoutLink?: string;
      conferenceData?: { conferenceId?: string; entryPoints?: { entryPointType: string; uri: string }[] };
    }>(
      organizer,
      [SCOPES.calendar],
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${input.attendees?.length ? "all" : "none"}`,
      { method: "POST", body: JSON.stringify(body) },
    );
    const joinUrl = ev.hangoutLink ?? ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
    if (!joinUrl) throw new GoogleError("Calendar created the event but no Meet link was returned (is Meet enabled for this user?)", 502);
    return { calendarEventId: ev.id, joinUrl, meetingCode: ev.conferenceData?.conferenceId ?? null };
  }

  async updateEvent(organizer: string, eventId: string, input: { title?: string; description?: string; start?: Date; end?: Date }) {
    const body: Record<string, unknown> = {};
    if (input.title) body.summary = input.title;
    if (input.description !== undefined) body.description = input.description;
    if (input.start) body.start = { dateTime: input.start.toISOString(), timeZone: this.cfg.timeZone };
    if (input.end) body.end = { dateTime: input.end.toISOString(), timeZone: this.cfg.timeZone };
    await this.api(
      organizer,
      [SCOPES.calendar],
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
  }

  async cancelEvent(organizer: string, eventId: string) {
    try {
      await this.api(
        organizer,
        [SCOPES.calendar],
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
        { method: "DELETE" },
      );
    } catch (e) {
      if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return;
      throw e;
    }
  }

  async configureSpace(
    organizer: string,
    meetingCode: string,
    opts: { accessType: "OPEN" | "TRUSTED" | "RESTRICTED"; autoRecord: boolean },
  ) {
    const scopes = [SCOPES.meetSettings];
    const space = await this.api<{ name: string; meetingCode?: string; meetingUri?: string }>(
      organizer,
      scopes,
      `https://meet.googleapis.com/v2/spaces/${encodeURIComponent(meetingCode)}`,
    );
    const mask = ["config.accessType", ...(opts.autoRecord ? ["config.artifactConfig.recordingConfig.autoRecordingGeneration"] : [])].join(
      ",",
    );
    await this.api(organizer, scopes, `https://meet.googleapis.com/v2/${space.name}?updateMask=${encodeURIComponent(mask)}`, {
      method: "PATCH",
      body: JSON.stringify({
        config: {
          accessType: opts.accessType,
          ...(opts.autoRecord ? { artifactConfig: { recordingConfig: { autoRecordingGeneration: "ON" } } } : {}),
        },
      }),
    });
    return { name: space.name, meetingCode: space.meetingCode ?? meetingCode, meetingUri: space.meetingUri ?? null };
  }

  async listRecordings(organizer: string, spaceName: string) {
    const scopes = [SCOPES.meetRead];
    const filter = encodeURIComponent(`space.name = "${spaceName}"`);
    const recs = await this.api<{ conferenceRecords?: { name: string }[] }>(
      organizer,
      scopes,
      `https://meet.googleapis.com/v2/conferenceRecords?filter=${filter}&pageSize=20`,
    );
    const out: MeetRecording[] = [];
    for (const cr of recs.conferenceRecords ?? []) {
      const r = await this.api<{
        recordings?: { name: string; state: string; startTime?: string; endTime?: string; driveDestination?: { file?: string } }[];
      }>(organizer, scopes, `https://meet.googleapis.com/v2/${cr.name}/recordings`);
      for (const x of r.recordings ?? [])
        out.push({
          name: x.name,
          state: x.state,
          startTime: x.startTime ?? null,
          endTime: x.endTime ?? null,
          driveFileId: x.driveDestination?.file ?? null,
        });
    }
    return out;
  }

  async getDriveFile(asUser: string, fileId: string) {
    const f = await this.api<{
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      videoMediaMetadata?: { durationMillis?: string };
    }>(
      asUser,
      [SCOPES.drive],
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,videoMediaMetadata&supportsAllDrives=true`,
    );
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.size ? Number(f.size) : null,
      durationSec: f.videoMediaMetadata?.durationMillis ? Math.round(Number(f.videoMediaMetadata.durationMillis) / 1000) : null,
    };
  }

  async downloadDriveFile(asUser: string, fileId: string, range?: string | null) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${await this.token(asUser, [SCOPES.drive])}`, ...(range ? { Range: range } : {}) },
    });
    if (!res.ok || !res.body)
      throw new GoogleError(`Drive download failed (${res.status}): ${(await res.text()).slice(0, 300)}`, res.status);
    return {
      status: res.status,
      body: res.body,
      headers: {
        contentLength: res.headers.get("content-length"),
        contentRange: res.headers.get("content-range"),
        contentType: res.headers.get("content-type"),
      },
    };
  }
}

/** Mock: deterministic fake events; any Drive file id is served from fixtures/sample.mp4 (if present). */
class MockGoogleWorkspace implements GoogleWorkspace {
  readonly isMock = true;
  constructor(private cfg: GoogleConfig) {}
  private code() {
    const s = randomBytes(6).toString("hex");
    return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7, 10)}`;
  }
  async createMeetEvent() {
    const code = this.code();
    return { calendarEventId: `mock-ev-${randomBytes(6).toString("hex")}`, joinUrl: `https://meet.google.com/${code}`, meetingCode: code };
  }
  async updateEvent() {}
  async cancelEvent() {}
  async configureSpace(_o: string, meetingCode: string) {
    return { name: `spaces/mock-${meetingCode}`, meetingCode, meetingUri: `https://meet.google.com/${meetingCode}` };
  }
  async listRecordings() {
    return [];
  }
  private fixture() {
    return this.cfg.mockDriveFile ?? "fixtures/sample.mp4";
  }
  async getDriveFile(_u: string, fileId: string) {
    const p = this.fixture();
    if (!existsSync(p)) throw new GoogleError(`Mock Drive: put a video at ${p} to simulate file ${fileId}`, 404);
    return { id: fileId, name: `${fileId}.mp4`, mimeType: "video/mp4", sizeBytes: statSync(p).size, durationSec: 3600 };
  }
  async downloadDriveFile(_u: string, _fileId: string, range?: string | null) {
    const p = this.fixture();
    const size = statSync(p).size;
    const m = range?.match(/bytes=(\d+)-(\d*)/);
    const start = m ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    const stream = Readable.toWeb(createReadStream(p, { start, end })) as ReadableStream<Uint8Array>;
    return {
      status: m ? 206 : 200,
      body: stream,
      headers: {
        contentLength: String(end - start + 1),
        contentRange: m ? `bytes ${start}-${end}/${size}` : null,
        contentType: "video/mp4",
      },
    };
  }
}

export function createGoogleWorkspace(cfg: GoogleConfig): GoogleWorkspace {
  return cfg.mode === "mock" ? new MockGoogleWorkspace(cfg) : new LiveGoogleWorkspace(cfg);
}

/** Accepts a Drive share URL or a raw file id. */
export function parseDriveFileId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/file\/d\/([\w-]{10,})/) ?? s.match(/[?&]id=([\w-]{10,})/) ?? s.match(/^([\w-]{10,})$/);
  return m ? m[1]! : null;
}
