import { JWT } from "google-auth-library";

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** Delivered to the app, which opens this lead when the notification is tapped. */
  leadId?: string;
}

export interface PushResult {
  providerMessageId?: string;
  /** The token is dead (app removed or reinstalled). Stop using it; it doesn't mean the phone should be signed out. */
  tokenInvalid?: boolean;
}

export interface PushSender {
  readonly provider: string;
  send(message: PushMessage): Promise<PushResult>;
}

class MockPushSender implements PushSender {
  readonly provider = "mock";
  async send(m: PushMessage) {
    console.log(`[push:mock] ${m.title}: ${m.body}`);
    return { providerMessageId: "mock" };
  }
}

/** Firebase Cloud Messaging HTTP v1, the channel every Android phone with Google services already listens on. */
class FcmPushSender implements PushSender {
  readonly provider = "fcm";
  private readonly client: JWT;
  private readonly url: string;

  constructor(serviceAccountJson: string) {
    const sa = JSON.parse(serviceAccountJson) as { project_id: string; client_email: string; private_key: string };
    this.client = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/firebase.messaging"] });
    this.url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  }

  async send(m: PushMessage): Promise<PushResult> {
    const { access_token } = await this.client.authorize();
    const res = await fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: m.token,
          notification: { title: m.title, body: m.body },
          data: m.leadId ? { leadId: m.leadId } : {},
          android: { priority: "high", notification: { channel_id: "alerts" } },
        },
      }),
    });
    if (res.ok) return { providerMessageId: ((await res.json()) as { name?: string }).name };
    const text = await res.text();
    if (res.status === 404 || text.includes("UNREGISTERED")) return { tokenInvalid: true };
    throw new Error(`FCM ${res.status}: ${text.slice(0, 500)}`);
  }
}

export function createPushSender(cfg: { mode: "mock" | "sandbox" | "live"; serviceAccountJson?: string }): PushSender {
  if (cfg.mode === "mock") return new MockPushSender();
  if (!cfg.serviceAccountJson) throw new Error("FCM_SERVICE_ACCOUNT_JSON is required unless PUSH_MODE=mock");
  return new FcmPushSender(cfg.serviceAccountJson);
}
