import { ApiError } from "@edge/contracts";

/** An API error as text Claude can act on (and pass on to the person in their words). */
export function toolErrorText(e: unknown): string {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : String(e);
  const fields = e.fieldErrors ? Object.entries(e.fieldErrors).map(([k, v]) => `- ${k}: ${v}`) : [];
  switch (e.code) {
    case "NOT_FOUND":
      return `${e.message}. It doesn't exist, or it's outside the projects this person can see.`;
    case "UNAUTHENTICATED":
      return `${e.message} The person needs to reconnect Claude to the Edge CRM.`;
    case "TWO_FACTOR_REQUIRED":
      return "This person must turn on two-factor authentication in the CRM (Security page) before using it, including through Claude.";
    case "MUST_CHANGE_PASSWORD":
      return "This person must choose a new password in the CRM before using it, including through Claude.";
    case "RATE_LIMITED":
      return `${e.message} Wait a minute before trying again.`;
    default:
      return [`${e.message} (${e.code})`, ...fields].join("\n");
  }
}
