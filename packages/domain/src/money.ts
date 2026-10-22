/** Money helpers. Amounts are integer minor units (fils for AED). */
export function formatMoney(minor: number, currency = "AED"): string {
  const major = minor / 100;
  return `${currency} ${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function toMinor(major: number | string): number {
  const n = typeof major === "string" ? Number(major.replace(/[, ]/g, "")) : major;
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${major}`);
  return Math.round(n * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}
