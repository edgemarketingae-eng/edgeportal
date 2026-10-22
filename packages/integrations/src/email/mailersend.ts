import type { EmailSender, OutgoingEmail } from "./types";

/** Transactional email via MailerSend (MailerLite's transactional sister product). */
export class MailerSendSender implements EmailSender {
  readonly provider = "mailersend";
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(email: OutgoingEmail) {
    const match = this.from.match(/^(.*)<(.+)>$/);
    const from = match ? { name: match[1].trim(), email: match[2].trim() } : { email: this.from };
    const res = await fetch("https://api.mailersend.com/v1/email", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [{ email: email.to }],
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: email.tags,
      }),
    });
    if (!res.ok) throw new Error(`MailerSend ${res.status}: ${await res.text()}`);
    return { providerMessageId: res.headers.get("x-message-id") ?? undefined };
  }
}
