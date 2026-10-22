import { ConsoleEmailSender } from "./console";
import { MailerSendSender } from "./mailersend";
import type { EmailSender } from "./types";

export type { EmailSender, OutgoingEmail } from "./types";

export interface EmailConfig {
  mode: "console" | "mailersend";
  from: string;
  mailersendApiKey?: string;
}

export function createEmailSender(cfg: EmailConfig): EmailSender {
  if (cfg.mode === "mailersend") {
    if (!cfg.mailersendApiKey) throw new Error("MAILERSEND_API_KEY is required for EMAIL_MODE=mailersend");
    return new MailerSendSender(cfg.mailersendApiKey, cfg.from);
  }
  return new ConsoleEmailSender();
}
