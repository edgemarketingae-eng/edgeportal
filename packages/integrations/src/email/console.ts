import type { EmailSender, OutgoingEmail } from "./types";

/** Development sender: prints the email instead of delivering it. */
export class ConsoleEmailSender implements EmailSender {
  readonly provider = "console";
  async send(email: OutgoingEmail) {
    console.log(`\n[email] to=${email.to} subject="${email.subject}"\n${email.text}\n`);
    return { providerMessageId: `console-${Date.now()}` };
  }
}
