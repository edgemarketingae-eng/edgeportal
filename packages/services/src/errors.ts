import { ApiError } from "@edge/contracts";

/** Service-layer errors carry the HTTP status the API should return. */
export class NotFoundError extends ApiError {
  constructor(what = "Resource") {
    super(404, "NOT_FOUND", `${what} not found`);
  }
}
export class TransitionError extends ApiError {
  constructor(message: string) {
    super(409, "TRANSITION_NOT_ALLOWED", message);
  }
}
export class CheckoutError extends ApiError {
  constructor(message: string) {
    super(422, "CHECKOUT_ERROR", message);
  }
}
export class BusinessError extends ApiError {
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(422, "BUSINESS_RULE", message, fieldErrors);
  }
}
export class ForbiddenError extends ApiError {
  constructor(message = "You do not have permission to do that.") {
    super(403, "FORBIDDEN", message);
  }
}
export class ValidationError extends ApiError {
  constructor(fieldErrors: Record<string, string>, message = "Please fix the highlighted fields.") {
    super(400, "VALIDATION", message, fieldErrors);
  }
}
export class RateLimitedError extends ApiError {
  constructor(message: string) {
    super(429, "RATE_LIMITED", message);
  }
}
