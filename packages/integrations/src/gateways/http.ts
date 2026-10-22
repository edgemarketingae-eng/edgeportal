import { GatewayError } from "./types";

/** JSON call to a payment provider with a timeout and a readable error. */
export async function providerFetch<T>(provider: string, url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: rest.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new GatewayError(`${provider} unreachable: ${String(e)}`);
  }
  const text = await res.text();
  if (!res.ok)
    throw new GatewayError(`${provider} ${rest.method ?? "GET"} ${new URL(url).pathname} failed (${res.status}): ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export const major = (minor: number) => (minor / 100).toFixed(2);

export function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? name, last: parts.slice(1).join(" ") || parts[0] || name };
}
