/** Odoo JSON-2 external API: POST /json/2/<model>/<method>, named parameters, bearer API key. */
export interface OdooClient {
  readonly isMock: boolean;
  call<T = unknown>(model: string, method: string, params?: Record<string, unknown>): Promise<T>;
}

export class OdooError extends Error {
  constructor(
    message: string,
    public status: number,
    public odooName?: string,
  ) {
    super(message);
  }
  /** Network problems, rate limits and server errors are worth retrying; validation errors are not. */
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export class Json2OdooClient implements OdooClient {
  readonly isMock = false;
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private database?: string,
  ) {}

  async call<T>(model: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/json/2/${model}/${method}`, {
        method: "POST",
        headers: {
          Authorization: `bearer ${this.apiKey}`,
          "Content-Type": "application/json; charset=utf-8",
          "User-Agent": "edge-academy-portal",
          ...(this.database ? { "X-Odoo-Database": this.database } : {}),
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new OdooError(`Odoo unreachable: ${String(e)}`, 0);
    }
    const text = await res.text();
    if (!res.ok) {
      let name: string | undefined;
      let message = text.slice(0, 500);
      try {
        const body = JSON.parse(text) as { name?: string; message?: string };
        name = body.name;
        message = body.message ?? message;
      } catch {
        // non-JSON error page
      }
      throw new OdooError(`Odoo ${model}.${method} failed (${res.status}): ${message}`, res.status, name);
    }
    return (text ? JSON.parse(text) : null) as T;
  }
}

/**
 * In-memory Odoo used in mock mode and tests. Implements only the calls the sync makes,
 * with the same idempotency-relevant behaviour (search by ref, draft -> posted -> paid).
 */
type Rec = Record<string, unknown> & { id: number };
const store = globalThis as unknown as { __odooMock?: { seq: number; tables: Record<string, Rec[]> } };

export class MockOdooClient implements OdooClient {
  readonly isMock = true;
  private get db() {
    return (store.__odooMock ??= { seq: 100, tables: {} });
  }
  static reset() {
    store.__odooMock = { seq: 100, tables: {} };
  }
  static table(model: string) {
    return store.__odooMock?.tables[model] ?? [];
  }

  async call<T>(model: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
    const t = (this.db.tables[model] ??= []);
    const ids = (params.ids as number[] | undefined) ?? [];
    switch (method) {
      case "search_read": {
        const domain = (params.domain as [string, string, unknown][]) ?? [];
        const rows = t.filter((r) =>
          domain.every(([f, op, v]) => (op === "=" ? r[f] === v : op === "in" ? (v as unknown[]).includes(r[f]) : true)),
        );
        return rows.slice(0, (params.limit as number) ?? rows.length) as T;
      }
      case "create": {
        const vals = (params.vals_list as Record<string, unknown>[]) ?? [];
        const created = vals.map((v) => {
          const rec: Rec = { ...v, id: ++this.db.seq };
          if (model === "account.move") {
            const lines = (v.invoice_line_ids as [number, number, { price_unit: number; tax_ids?: [number, number, number[]][] }][]) ?? [];
            const total = lines.reduce((s, [, , l]) => {
              const taxed = (l.tax_ids?.[0]?.[2] ?? []).includes(5) ? 0.05 : 0;
              return s + Math.round(l.price_unit * 100) + Math.round(l.price_unit * 100 * taxed);
            }, 0);
            Object.assign(rec, { name: "/", state: "draft", payment_state: "not_paid", amount_total: total / 100 });
          }
          if (model === "account.payment.register") rec.context = params.context;
          t.push(rec);
          return rec.id;
        });
        return created as T;
      }
      case "action_post": {
        for (const r of t.filter((x) => ids.includes(x.id))) {
          r.state = "posted";
          r.name = `INV/2026/${String(r.id).padStart(5, "0")}`;
        }
        return true as T;
      }
      case "action_create_payments": {
        const wizard = t.find((x) => ids.includes(x.id));
        const ctx = wizard?.context as { active_ids?: number[] } | undefined;
        const moves = this.db.tables["account.move"] ?? [];
        for (const m of moves.filter((x) => ctx?.active_ids?.includes(x.id))) m.payment_state = "paid";
        const pay: Rec = { id: ++this.db.seq, amount: wizard?.amount };
        (this.db.tables["account.payment"] ??= []).push(pay);
        return { res_id: pay.id } as T;
      }
      case "get_portal_url":
        return `/my/invoices/${ids[0]}?access_token=mock` as T;
      default:
        throw new OdooError(`Mock Odoo does not implement ${model}.${method}`, 400);
    }
  }
}

export interface OdooConfig {
  mode: "mock" | "sandbox" | "live";
  url?: string;
  db?: string;
  apiKey?: string;
}

export function createOdooClient(cfg: OdooConfig): OdooClient {
  if (cfg.mode === "mock") return new MockOdooClient();
  if (!cfg.url || !cfg.apiKey) throw new OdooError("ODOO_URL and ODOO_API_KEY are required", 400);
  return new Json2OdooClient(cfg.url, cfg.apiKey, cfg.db);
}
