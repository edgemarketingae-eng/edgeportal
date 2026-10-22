/** MailerLite (broadcast lists) API client: live REST client and an in-memory mock. */
export interface MailerLiteApi {
  upsertSubscriber(input: { email: string; name: string; phone: string | null; country: string; status: "active" | "unsubscribed" }): Promise<{ id: string; groupNames: { id: string; name: string }[] }>;
  findOrCreateGroup(name: string): Promise<string>;
  addToGroup(subscriberId: string, groupId: string): Promise<void>;
  removeFromGroup(subscriberId: string, groupId: string): Promise<void>;
}

class LiveMailerLite implements MailerLiteApi {
  private groups = new Map<string, string>();
  constructor(private token: string) {}

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://connect.mailerlite.com/api${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`MailerLite ${init.method ?? "GET"} ${path} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return (res.status === 204 ? null : await res.json()) as T;
  }

  async upsertSubscriber(input: { email: string; name: string; phone: string | null; country: string; status: "active" | "unsubscribed" }) {
    const res = await this.req<{ data: { id: string; groups?: { id: string; name: string }[] } }>("/subscribers", {
      method: "POST",
      body: JSON.stringify({ email: input.email, status: input.status, fields: { name: input.name, phone: input.phone ?? undefined, country: input.country } }),
    });
    return { id: res.data.id, groupNames: res.data.groups ?? [] };
  }

  async findOrCreateGroup(name: string) {
    const hit = this.groups.get(name);
    if (hit) return hit;
    const found = await this.req<{ data: { id: string; name: string }[] }>(`/groups?filter[name]=${encodeURIComponent(name)}&limit=50`);
    let id = found.data.find((g) => g.name === name)?.id;
    if (!id) id = (await this.req<{ data: { id: string } }>("/groups", { method: "POST", body: JSON.stringify({ name }) })).data.id;
    this.groups.set(name, id);
    return id;
  }

  async addToGroup(subscriberId: string, groupId: string) {
    await this.req(`/subscribers/${subscriberId}/groups/${groupId}`, { method: "POST" });
  }

  async removeFromGroup(subscriberId: string, groupId: string) {
    await this.req(`/subscribers/${subscriberId}/groups/${groupId}`, { method: "DELETE" });
  }
}

export class MockMailerLite implements MailerLiteApi {
  subscribers = new Map<string, { id: string; email: string; status: string; groups: Set<string> }>();
  groups = new Map<string, string>();
  async upsertSubscriber(input: { email: string; status: "active" | "unsubscribed" }) {
    let s = this.subscribers.get(input.email);
    if (!s) this.subscribers.set(input.email, (s = { id: `sub_${this.subscribers.size + 1}`, email: input.email, status: input.status, groups: new Set() }));
    s.status = input.status;
    return { id: s.id, groupNames: [...s.groups].map((id) => ({ id, name: [...this.groups].find(([, g]) => g === id)?.[0] ?? id })) };
  }
  async findOrCreateGroup(name: string) {
    if (!this.groups.has(name)) this.groups.set(name, `grp_${this.groups.size + 1}`);
    return this.groups.get(name)!;
  }
  private byId(id: string) {
    return [...this.subscribers.values()].find((s) => s.id === id)!;
  }
  async addToGroup(subscriberId: string, groupId: string) {
    this.byId(subscriberId).groups.add(groupId);
  }
  async removeFromGroup(subscriberId: string, groupId: string) {
    this.byId(subscriberId).groups.delete(groupId);
  }
}

export function createMailerLite(cfg: { mode: "mock" | "sandbox" | "live"; apiKey?: string }): MailerLiteApi {
  if (cfg.mode === "mock") return new MockMailerLite();
  if (!cfg.apiKey) throw new Error("MAILERLITE_API_KEY is required");
  return new LiveMailerLite(cfg.apiKey);
}
