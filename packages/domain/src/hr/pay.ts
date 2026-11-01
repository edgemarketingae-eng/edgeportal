import { PAY_CURRENCIES, type PayCurrency, type PayLineKind } from "./enums";

export interface PayLineAmount {
  kind?: PayLineKind;
  label?: string;
  currency: string;
  amountMinor: number;
}

export interface CurrencyTotal {
  currency: PayCurrency;
  minor: number;
}

/** Sum per currency, in menu order. Currencies are never added together, and one that nets to zero is dropped. */
export function totalsByCurrency(lines: PayLineAmount[]): CurrencyTotal[] {
  const sums = new Map<string, number>();
  for (const l of lines) sums.set(l.currency, (sums.get(l.currency) ?? 0) + l.amountMinor);
  return PAY_CURRENCIES.filter((c) => sums.get(c)).map((currency) => ({ currency, minor: sums.get(currency)! }));
}

/** A payslip's net in one currency: the most a negative adjustment can take from it, since currencies can't offset each other. */
export function netIn(lines: PayLineAmount[], currency: string) {
  return lines.filter((l) => l.currency === currency).reduce((sum, l) => sum + l.amountMinor, 0);
}

export const negativeTotals = (lines: PayLineAmount[]) => totalsByCurrency(lines).filter((t) => t.minor < 0);

/** "3,000 AED", "1,250.50 USD": whole amounts drop the decimals. */
export function formatPayAmount(minor: number, currency: string) {
  const major = Math.abs(minor) / 100;
  const digits = minor % 100 === 0 ? 0 : 2;
  return `${minor < 0 ? "-" : ""}${major.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency}`;
}

/** "3,000 AED + 500 USD". Nothing is converted, so the parts are only ever listed side by side. */
export function formatPayTotal(totals: CurrencyTotal[]) {
  if (!totals.length) return "0";
  return totals.reduce((text, t, i) => {
    if (i === 0) return formatPayAmount(t.minor, t.currency);
    return `${text} ${t.minor < 0 ? "-" : "+"} ${formatPayAmount(Math.abs(t.minor), t.currency)}`;
  }, "");
}

/** Equal installments over `months`; the last one takes the rounding remainder, so they always add up to the amount. */
export function splitInstallments(amountMinor: number, months: string[]) {
  const each = Math.floor(amountMinor / months.length);
  return months.map((month, i) => ({ month, amountMinor: i === months.length - 1 ? amountMinor - each * (months.length - 1) : each }));
}
