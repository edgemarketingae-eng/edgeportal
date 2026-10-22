import twilio from "twilio";

export type OtpChannel = "sms" | "whatsapp";

export interface OtpProvider {
  readonly isMock: boolean;
  start(phoneE164: string, channel: OtpChannel): Promise<void>;
  check(phoneE164: string, code: string): Promise<boolean>;
}

/** Deterministic provider for development and tests: the code is always 000000. */
export const MOCK_OTP_CODE = "000000";

class MockOtpProvider implements OtpProvider {
  readonly isMock = true;
  async start(phone: string, channel: OtpChannel) {
    console.log(`[otp:mock] ${channel} code for ${phone} is ${MOCK_OTP_CODE}`);
  }
  async check(_phone: string, code: string) {
    return code === MOCK_OTP_CODE;
  }
}

/** Twilio Verify generates, delivers and checks the code (fraud guard + retries included). */
class TwilioVerifyProvider implements OtpProvider {
  readonly isMock = false;
  private client;
  constructor(
    accountSid: string,
    authToken: string,
    private serviceSid: string,
  ) {
    this.client = twilio(accountSid, authToken);
  }
  async start(phone: string, channel: OtpChannel) {
    await this.client.verify.v2.services(this.serviceSid).verifications.create({ to: phone, channel });
  }
  async check(phone: string, code: string) {
    try {
      const res = await this.client.verify.v2.services(this.serviceSid).verificationChecks.create({ to: phone, code });
      return res.status === "approved";
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 404 || status === 429) return false; // expired/consumed or too many attempts
      throw e;
    }
  }
}

export interface OtpConfig {
  mode: "mock" | "sandbox" | "live";
  accountSid?: string;
  authToken?: string;
  serviceSid?: string;
}

export function createOtpProvider(cfg: OtpConfig): OtpProvider {
  if (cfg.mode === "mock") return new MockOtpProvider();
  if (!cfg.accountSid || !cfg.authToken || !cfg.serviceSid) throw new Error("Twilio Verify credentials are required when OTP_MODE is not mock");
  return new TwilioVerifyProvider(cfg.accountSid, cfg.authToken, cfg.serviceSid);
}
