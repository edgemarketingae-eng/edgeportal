import type { Gateway } from "@edge/domain/enums";
import { MockGatewayAdapter } from "./mock";
import { NomodAdapter } from "./nomod";
import { StripeAdapter } from "./stripe";
import { TabbyAdapter } from "./tabby";
import { TamaraAdapter } from "./tamara";
import { GatewayError, type GatewayAdapter, type GatewayDeps } from "./types";

export interface GatewayConfig {
  mode: "mock" | "sandbox" | "live";
  allowMock: boolean;
  mockSecret: string;
  studentAppUrl: string; // mock checkout page lives in the student app
  apiPublicUrl: string; // Tamara notification URL
  stripe?: { secretKey?: string; webhookSecret?: string };
  tabby?: { apiUrl: string; secretKey?: string; merchantCode?: string; webhookHeaderValue?: string };
  tamara?: { apiUrl?: string; apiToken?: string; notificationToken?: string };
  nomod?: { apiUrl: string; apiKey?: string; webhookSecret?: string };
}

const UNAVAILABLE = "This payment method is not available right now. Please choose another.";

export interface GatewayRegistry {
  getAdapter(gateway: Gateway): GatewayAdapter;
  getWebhookAdapter(segment: string): GatewayAdapter | null;
}

/** In mode=mock every gateway is served by the mock adapter (real gateway labels and fees are kept). */
export function createGatewayRegistry(cfg: GatewayConfig, deps: GatewayDeps): GatewayRegistry {
  const cache = new Map<string, GatewayAdapter>();
  const mock = (g: Gateway) => new MockGatewayAdapter(g, cfg.mockSecret, cfg.studentAppUrl, deps);

  function getAdapter(gateway: Gateway): GatewayAdapter {
    const hit = cache.get(gateway);
    if (hit) return hit;
    let adapter: GatewayAdapter;
    if (cfg.mode === "mock" || gateway === "MOCK") adapter = mock(gateway);
    else if (gateway === "STRIPE") {
      if (!cfg.stripe?.secretKey) throw new GatewayError("STRIPE_SECRET_KEY missing", UNAVAILABLE);
      adapter = new StripeAdapter(cfg.stripe.secretKey, cfg.stripe.webhookSecret);
    } else if (gateway === "TABBY") {
      if (!cfg.tabby?.secretKey || !cfg.tabby.merchantCode) throw new GatewayError("Tabby credentials missing", UNAVAILABLE);
      adapter = new TabbyAdapter(cfg.tabby.apiUrl, cfg.tabby.secretKey, cfg.tabby.merchantCode, cfg.tabby.webhookHeaderValue, deps);
    } else if (gateway === "TAMARA") {
      if (!cfg.tamara?.apiToken) throw new GatewayError("Tamara credentials missing", UNAVAILABLE);
      const base = cfg.tamara.apiUrl ?? (cfg.mode === "live" ? "https://api.tamara.co" : "https://api-sandbox.tamara.co");
      adapter = new TamaraAdapter(base, cfg.tamara.apiToken, cfg.tamara.notificationToken, `${cfg.apiPublicUrl}/api/webhooks/tamara`);
    } else if (gateway === "NOMOD") {
      if (!cfg.nomod?.apiKey) throw new GatewayError("Nomod credentials missing", UNAVAILABLE);
      adapter = new NomodAdapter(cfg.nomod.apiUrl, cfg.nomod.apiKey, cfg.nomod.webhookSecret, deps);
    } else throw new GatewayError(`${gateway} has no online checkout`, UNAVAILABLE);
    cache.set(gateway, adapter);
    return adapter;
  }

  function getWebhookAdapter(segment: string): GatewayAdapter | null {
    const map: Record<string, Gateway> = { stripe: "STRIPE", nomod: "NOMOD", tabby: "TABBY", tamara: "TAMARA", mock: "MOCK" };
    const gateway = map[segment];
    if (!gateway) return null;
    if (gateway === "MOCK") return cfg.allowMock ? mock("MOCK") : null;
    return getAdapter(gateway);
  }

  return { getAdapter, getWebhookAdapter };
}
