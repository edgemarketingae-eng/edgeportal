import { formatDate, formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";

/** Transactional email templates. Inline styles only (email clients). Brand: Edge Green on Near-Black Teal. */
export interface TemplateData {
  "auth.resetPassword": { name: string; url: string };
  "auth.staffWelcome": { name: string; email: string; tempPassword: string; loginUrl: string };
  "enrollment.paymentReceived": {
    name: string;
    batchName: string;
    amountMinor: number;
    currency: string;
    kind: string;
    balanceMinor: number;
    balanceDueOn?: string | null;
    pendingApproval: boolean;
    receiptUrl?: string | null;
  };
  "enrollment.approved": { name: string; batchName: string; dashboardUrl: string; whatsappGroupUrl?: string | null };
  "enrollment.rejected": { name: string; batchName: string; reason: string; supportEmail: string };
  "enrollment.balanceReminder": {
    name: string;
    batchName: string;
    balanceMinor: number;
    currency: string;
    balanceDueOn: string;
    daysLeft: number;
    payUrl: string;
  };
  "enrollment.locked": {
    name: string;
    batchName: string;
    balanceMinor: number;
    currency: string;
    payUrl: string;
    manual: boolean;
    note?: string | null;
  };
  "enrollment.unlocked": { name: string; batchName: string; dashboardUrl: string };
  "class.scheduled": { name: string; title: string; batchName: string; startsAt: string; classesUrl: string };
  "class.cancelled": { name: string; title: string; startsAt: string; reason?: string | null };
}

export type TemplateName = keyof TemplateData;

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p}</p>`).join("");
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#08E186;color:#021A1A;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;display:inline-block">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F1F7F7;font-family:Manrope,Arial,Helvetica,sans-serif;color:#021A1A">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F7F7;padding:24px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#021A1A;padding:20px 28px;color:#08E186;font-weight:800;letter-spacing:1px;font-size:18px">EDGE <span style="color:#F1F7F7;font-weight:700;font-size:12px;letter-spacing:2px">TRADING</span> <span style="color:#F1F7F7;font-weight:400;font-size:12px;letter-spacing:2px">ACADEMY</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 18px;font-size:20px;text-transform:uppercase;letter-spacing:.5px">${esc(title)}</h1>
${body}${button}
</td></tr>
<tr><td style="padding:16px 28px;background:#F1F7F7;color:#4A5F5F;font-size:12px">Edge Trading Academy · Dubai, UAE · This is an automated message.</td></tr>
</table></td></tr></table></body></html>`;
}

function text(paragraphs: string[], cta?: { label: string; url: string }) {
  const strip = (s: string) => s.replace(/<[^>]+>/g, "");
  return [...paragraphs.map(strip), cta ? `${cta.label}: ${cta.url}` : ""].filter(Boolean).join("\n\n");
}

function build(subject: string, title: string, paragraphs: string[], cta?: { label: string; url: string }): Rendered {
  return { subject, html: layout(title, paragraphs, cta), text: text(paragraphs, cta) };
}

export function renderEmail<T extends TemplateName>(template: T, data: TemplateData[T]): Rendered {
  const d = data as never as Record<string, unknown>;
  switch (template) {
    case "auth.resetPassword": {
      const x = d as unknown as TemplateData["auth.resetPassword"];
      return build(
        "Reset your Edge Academy password",
        "Reset your password",
        [
          `Hi ${esc(x.name)},`,
          "We received a request to reset your password. The link below is valid for one hour.",
          "If you did not ask for this, you can ignore this email.",
        ],
        { label: "Reset password", url: x.url },
      );
    }
    case "auth.staffWelcome": {
      const x = d as unknown as TemplateData["auth.staffWelcome"];
      return build(
        "Your Edge Academy staff account",
        "Welcome to the team",
        [
          `Hi ${esc(x.name)},`,
          `Your staff account has been created. Sign in with <b>${esc(x.email)}</b> and this temporary password: <b>${esc(x.tempPassword)}</b>`,
          "You will be asked to choose a new password the first time you sign in.",
        ],
        { label: "Sign in", url: x.loginUrl },
      );
    }
    case "enrollment.paymentReceived": {
      const x = d as unknown as TemplateData["enrollment.paymentReceived"];
      const lines = [
        `Hi ${esc(x.name)},`,
        `We received your payment of <b>${formatMoney(x.amountMinor, x.currency)}</b> for <b>${esc(x.batchName)}</b>.`,
      ];
      if (x.balanceMinor > 0) {
        lines.push(
          `Remaining course balance: <b>${formatMoney(x.balanceMinor, x.currency)}</b>${x.balanceDueOn ? `, due by <b>${formatDate(x.balanceDueOn)}</b>` : ""}.`,
        );
      } else {
        lines.push("Your course fee is now fully paid. Thank you!");
      }
      if (x.pendingApproval)
        lines.push("Our team is verifying your registration. You will get another email as soon as your access is active.");
      return build(
        "Payment received - Edge Academy",
        "Payment received",
        lines,
        x.receiptUrl ? { label: "View receipt", url: x.receiptUrl } : undefined,
      );
    }
    case "enrollment.approved": {
      const x = d as unknown as TemplateData["enrollment.approved"];
      const lines = [
        `Hi ${esc(x.name)},`,
        `Your registration for <b>${esc(x.batchName)}</b> is approved and your student portal is now active.`,
      ];
      if (x.whatsappGroupUrl)
        lines.push(`Join your batch WhatsApp group: <a href="${esc(x.whatsappGroupUrl)}">${esc(x.whatsappGroupUrl)}</a>`);
      return build("You're in! Your Edge Academy access is active", "Welcome aboard", lines, {
        label: "Open student portal",
        url: x.dashboardUrl,
      });
    }
    case "enrollment.rejected": {
      const x = d as unknown as TemplateData["enrollment.rejected"];
      return build("About your Edge Academy registration", "Registration update", [
        `Hi ${esc(x.name)},`,
        `We could not approve your registration for <b>${esc(x.batchName)}</b>.`,
        `Reason: ${esc(x.reason)}`,
        `Please contact us at ${esc(x.supportEmail)} so we can help.`,
      ]);
    }
    case "enrollment.balanceReminder": {
      const x = d as unknown as TemplateData["enrollment.balanceReminder"];
      const when = x.daysLeft > 1 ? `in ${x.daysLeft} days` : x.daysLeft === 1 ? "tomorrow" : "today";
      return build(
        `Course balance due ${when}`,
        "Balance reminder",
        [
          `Hi ${esc(x.name)},`,
          `Your remaining balance of <b>${formatMoney(x.balanceMinor, x.currency)}</b> for <b>${esc(x.batchName)}</b> is due ${when} (${formatDate(x.balanceDueOn)}).`,
          "If it is not paid by the due date, access to classes and recordings is paused until the balance is cleared.",
        ],
        { label: "Pay balance", url: x.payUrl },
      );
    }
    case "enrollment.locked": {
      const x = d as unknown as TemplateData["enrollment.locked"];
      const lines = [`Hi ${esc(x.name)},`];
      if (x.manual)
        lines.push(`Your access to <b>${esc(x.batchName)}</b> has been paused by our team.${x.note ? ` Note: ${esc(x.note)}` : ""}`);
      else
        lines.push(
          `Your access to <b>${esc(x.batchName)}</b> is paused because the course balance of <b>${formatMoney(x.balanceMinor, x.currency)}</b> was not paid by the due date.`,
          "Pay the balance and your access is restored immediately.",
        );
      return build(
        "Your Edge Academy access is paused",
        "Access paused",
        lines,
        x.manual ? undefined : { label: "Pay balance", url: x.payUrl },
      );
    }
    case "enrollment.unlocked": {
      const x = d as unknown as TemplateData["enrollment.unlocked"];
      return build(
        "Your Edge Academy access is restored",
        "Access restored",
        [`Hi ${esc(x.name)},`, `Your access to <b>${esc(x.batchName)}</b> is active again.`],
        { label: "Open student portal", url: x.dashboardUrl },
      );
    }
    case "class.scheduled": {
      const x = d as unknown as TemplateData["class.scheduled"];
      return build(
        `Live class: ${x.title}`,
        "New live class",
        [
          `Hi ${esc(x.name)},`,
          `A live class has been scheduled for <b>${esc(x.batchName)}</b>: <b>${esc(x.title)}</b> on <b>${formatDateTime(x.startsAt)}</b> (Dubai time).`,
          "The join button appears in your portal 15 minutes before the class starts.",
        ],
        { label: "View classes", url: x.classesUrl },
      );
    }
    case "class.cancelled": {
      const x = d as unknown as TemplateData["class.cancelled"];
      return build(`Class cancelled: ${x.title}`, "Class cancelled", [
        `Hi ${esc(x.name)},`,
        `The live class <b>${esc(x.title)}</b> on ${formatDateTime(x.startsAt)} has been cancelled.${x.reason ? ` Reason: ${esc(x.reason)}` : ""}`,
      ]);
    }
  }
  throw new Error(`Unknown template ${template as string}`);
}
