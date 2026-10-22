/** Every non-2xx API response has this shape. */
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "MUST_CHANGE_PASSWORD",
  "TWO_FACTOR_REQUIRED",
  "PHONE_NOT_VERIFIED",
  "NOT_FOUND",
  "VALIDATION",
  "CONFLICT",
  "TRANSITION_NOT_ALLOWED",
  "CHECKOUT_ERROR",
  "BUSINESS_RULE",
  "RATE_LIMITED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string>; requestId?: string };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}), ...(this.requestId ? { requestId: this.requestId } : {}) } };
  }

  static fromBody(status: number, body: unknown): ApiError {
    const e = (body as Partial<ApiErrorBody> | undefined)?.error;
    return new ApiError(status, e?.code ?? "INTERNAL", e?.message ?? `Request failed (${status})`, e?.fieldErrors, e?.requestId);
  }
}

/** First message per top-level field, the shape forms render. */
export function fieldErrorsFromIssues(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? "_")] ??= i.message;
  return out;
}
