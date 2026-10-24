import { isCountryCode } from "@edge/domain/countries";
import { z } from "zod";

/** 24-char hex MongoDB ObjectId as it travels over the wire. */
export const zObjectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
export const zIsoDate = z.string(); // ISO 8601 date-time string
export const zDateOnly = z.iso.date();
export const zMinor = z.number().int().refine(Number.isSafeInteger, "Amount out of range");

export const PAGE_SIZES = [25, 50, 100] as const;
/** Query params of a paged list. Spread `zPage.shape` into a filter schema. */
export const zPage = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type PageQuery = z.infer<typeof zPage>;

/** One page of a list: the rows plus what the pager needs. */
export function paged<T extends z.ZodType>(row: T) {
  return z.object({ rows: z.array(row), total: z.number(), page: z.number(), pageSize: z.number() });
}
export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** ISO 3166 alpha-2 country with a phone numbering plan, e.g. "AE", "IN". */
export const zCountry = z.string().trim().toUpperCase().refine(isCountryCode, "Choose a valid country");

export const zOk = z.object({ ok: z.literal(true), message: z.string().optional() });
export type Ok = z.infer<typeof zOk>;

/** Trim + lowercase BEFORE validating (z.email().trim() validates first and rejects " a@b.com"). */
export const zEmail = (message = "Enter a valid email") => z.string().trim().toLowerCase().pipe(z.email(message));
