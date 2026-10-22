import { z } from "zod";

/** 24-char hex MongoDB ObjectId as it travels over the wire. */
export const zObjectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
export const zIsoDate = z.string(); // ISO 8601 date-time string
export const zDateOnly = z.iso.date();
export const zMinor = z.number().int().refine(Number.isSafeInteger, "Amount out of range");

export const zPage = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(100) });

export const zOk = z.object({ ok: z.literal(true), message: z.string().optional() });
export type Ok = z.infer<typeof zOk>;

/** Trim + lowercase BEFORE validating (z.email().trim() validates first and rejects " a@b.com"). */
export const zEmail = (message = "Enter a valid email") => z.string().trim().toLowerCase().pipe(z.email(message));
