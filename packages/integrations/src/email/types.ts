export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: string[];
}

export interface EmailSender {
  readonly provider: string;
  send(email: OutgoingEmail): Promise<{ providerMessageId?: string }>;
}
