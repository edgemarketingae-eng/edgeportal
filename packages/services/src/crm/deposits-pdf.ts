import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DepositFilters, LeadDepositDto } from "@edge/contracts";
import { now } from "@edge/domain/clock";
import { DEPOSIT_SEQUENCE_LABELS, DEPOSIT_STATUS_LABELS, LEADERBOARD_PERIOD_LABELS } from "@edge/domain/crm/labels";
import { formatDate, formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import PDFDocument from "pdfkit";
import { hasDays, optId, userNames } from "./common";
import { depositExportRows } from "./deposits";
import { has, type CrmScope } from "./scope";

/** A PDF this long is still quick to make and open; past it, the CSV is the full list. */
export const DEPOSITS_PDF_CAP = 5_000;

const INK = "#021a1a";
const EMERALD = "#03624c";
const MUTED = "#5b6b6b";
const RULE = "#d7e3e0";
const HEAD_BG = "#e8f6f5";
const STRIPE = "#f6faf9";

/** Manrope (the CRM's font) covers far more characters than the built-in PDF fonts; Helvetica only if it is missing. */
const fontFile = (name: string) => fileURLToPath(new URL(`../../assets/fonts/${name}`, import.meta.url));
const FONTS = { regular: fontFile("Manrope-Regular.ttf"), bold: fontFile("Manrope-Bold.ttf") };

const usd = (minor: number) => formatMoney(minor, "USD");
/** 125050 -> "1,250.50" (the column header says USD). */
const amount = (minor: number) => (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Col = { label: string; width: number; align?: "right"; cell: (d: LeadDepositDto) => string; bold?: (d: LeadDepositDto) => boolean };

const COLUMNS: Col[] = [
  { label: "Date", width: 62, cell: (d) => formatDate(d.depositedAt) },
  { label: "Lead", width: 140, cell: (d) => d.lead.name },
  { label: "JetaFX ID", width: 70, cell: (d) => d.jetaFxClientId ?? "–" },
  { label: "Deposit", width: 60, cell: (d) => DEPOSIT_SEQUENCE_LABELS[d.sequence] },
  { label: "Logged (USD)", width: 76, align: "right", cell: (d) => amount(d.amountMinor) },
  {
    label: "Net (USD)",
    width: 76,
    align: "right",
    cell: (d) => (d.status === "REJECTED" ? "–" : amount(d.netAmountMinor)),
    bold: (d) => d.status !== "REJECTED" && d.netAmountMinor !== d.amountMinor,
  },
  { label: "Status", width: 58, cell: (d) => DEPOSIT_STATUS_LABELS[d.status] },
  { label: "Counts for", width: 90, cell: (d) => d.creditedTo?.name ?? "–" },
  { label: "Reviewed by", width: 75, cell: (d) => (d.status === "PENDING" ? "–" : (d.reviewedBy?.name ?? "–")) },
  { label: "Commission", width: 62, align: "right", cell: (d) => (d.commissionMinor == null ? "–" : usd(d.commissionMinor)) },
];

/** "Search “ali” · Verified · Credited to Sara · 1 Nov 2026 – 25 Nov 2026" */
async function filterText(filters: DepositFilters, scope: CrmScope, manage: boolean) {
  const parts: string[] = [];
  const q = filters.q?.trim();
  if (q) parts.push(`Search “${q}”`);
  if (filters.status) parts.push(DEPOSIT_STATUS_LABELS[filters.status]);
  const staff = manage ? optId(filters.staff) : null;
  if (staff) parts.push(`Credited to ${(await userNames([staff])).get(String(staff)) ?? "Unknown"}`);
  if (hasDays(filters)) {
    const from = filters.from ? formatDate(filters.from) : null;
    const to = filters.to ? formatDate(filters.to) : null;
    parts.push(from && to ? (from === to ? from : `${from} – ${to}`) : from ? `From ${from}` : `Until ${to}`);
  } else parts.push(filters.period && filters.period !== "all" ? LEADERBOARD_PERIOD_LABELS[filters.period] : "All dates");
  if (!manage) parts.push("Deposits credited to or logged by you");
  return parts.join(" · ");
}

/** Counts and amounts over the rows in the file (net amounts: what counts for commission). */
function totals(rows: LeadDepositDto[]) {
  const sum = (xs: LeadDepositDto[], f: (d: LeadDepositDto) => number) => xs.reduce((n, d) => n + f(d), 0);
  const by = (s: LeadDepositDto["status"]) => rows.filter((d) => d.status === s);
  const live = rows.filter((d) => d.status !== "REJECTED");
  const adjusted = live.filter((d) => d.netAmountMinor !== d.amountMinor);
  const seen = rows.filter((d) => d.commissionMinor != null);
  return [
    { label: "Pending", value: usd(sum(by("PENDING"), (d) => d.netAmountMinor)), hint: `${by("PENDING").length} deposits` },
    { label: "Verified", value: usd(sum(by("VERIFIED"), (d) => d.netAmountMinor)), hint: `${by("VERIFIED").length} deposits` },
    {
      label: "Net adjustments",
      value: usd(sum(adjusted, (d) => d.netAmountMinor - d.amountMinor)),
      hint: `${adjusted.length} deposit${adjusted.length === 1 ? "" : "s"} adjusted`,
    },
    ...(seen.length ? [{ label: "Commission", value: usd(sum(seen, (d) => d.commissionMinor ?? 0)), hint: "on verified deposits" }] : []),
    { label: "Rejected", value: String(by("REJECTED").length), hint: "count for nothing" },
  ];
}

/**
 * The deposits the list's filters select (all pages, newest first, at most `DEPOSITS_PDF_CAP`) as an A4 landscape PDF:
 * the filters, totals, then a table that repeats its header on every page. Commission only where the viewer sees it.
 */
export async function depositsPdf(filters: DepositFilters, scope: CrmScope): Promise<Buffer> {
  const manage = has(scope, "crm.commission.manage");
  const [{ rows, total }, filterLine, names] = await Promise.all([
    depositExportRows(filters, scope, DEPOSITS_PDF_CAP),
    filterText(filters, scope, manage),
    userNames([scope.me]),
  ]);

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 36,
    bufferPages: true,
    info: { Title: "Deposits", Author: "Edge Trading Academy CRM" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const embedded = existsSync(FONTS.regular) && existsSync(FONTS.bold);
  doc.registerFont("body", embedded ? FONTS.regular : "Helvetica");
  doc.registerFont("bold", embedded ? FONTS.bold : "Helvetica-Bold");

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 14; // room for the footer
  /** Cut text to fit `w` points, ending in an ellipsis. */
  const fit = (text: string, w: number) => {
    if (doc.widthOfString(text) <= w) return text;
    let s = text;
    while (s.length > 1 && doc.widthOfString(`${s}…`) > w) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  };
  const line = (text: string, x: number, y: number, w: number, align: "left" | "right" = "left") =>
    doc.text(fit(text, w), x, y, { width: w, align, lineBreak: false });

  // Title and what the file covers.
  let y = doc.page.margins.top;
  doc.font("bold").fontSize(18).fillColor(INK);
  line("Deposits", left, y, width);
  doc.font("body").fontSize(8.5).fillColor(MUTED);
  line(
    `Edge Trading Academy CRM · exported ${formatDateTime(now())} (Dubai) by ${names.get(String(scope.me)) ?? "a CRM user"}`,
    left,
    y + 6,
    width,
    "right",
  );
  y += 28;
  doc.font("body").fontSize(9).fillColor(INK);
  line(filterLine, left, y, width);
  y += 14;
  doc.fontSize(8.5).fillColor(MUTED);
  line(
    rows.length < total
      ? `Showing the newest ${rows.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} deposits. Export CSV for all of them.`
      : `${total.toLocaleString("en-US")} deposit${total === 1 ? "" : "s"}. Amounts in USD; commission is worked out on the net amount.`,
    left,
    y,
    width,
  );
  y += 18;

  // Totals.
  const boxes = totals(rows);
  const gap = 8;
  const boxW = (width - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach((b, i) => {
    const x = left + i * (boxW + gap);
    doc.roundedRect(x, y, boxW, 44, 4).lineWidth(0.75).strokeColor(RULE).stroke();
    doc.font("body").fontSize(7).fillColor(MUTED);
    line(b.label.toUpperCase(), x + 8, y + 7, boxW - 16);
    doc.font("bold").fontSize(11.5).fillColor(INK);
    line(b.value, x + 8, y + 17, boxW - 16);
    doc.font("body").fontSize(7).fillColor(MUTED);
    line(b.hint, x + 8, y + 33, boxW - 16);
  });
  y += 58;

  // The table.
  const ROW = 17;
  const scale = width / COLUMNS.reduce((n, c) => n + c.width, 0);
  const cols = COLUMNS.map((c) => ({ ...c, width: c.width * scale }));
  const header = () => {
    doc.rect(left, y, width, ROW).fill(HEAD_BG);
    doc.font("bold").fontSize(7.5).fillColor(EMERALD);
    let x = left;
    for (const c of cols) {
      line(c.label, x + 4, y + 5, c.width - 8, c.align);
      x += c.width;
    }
    y += ROW;
  };
  header();
  if (!rows.length) {
    doc.font("body").fontSize(9).fillColor(MUTED);
    line("No deposits match these filters.", left + 4, y + 8, width - 8);
  }
  rows.forEach((d, i) => {
    if (y + ROW > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
      header();
    }
    if (i % 2) doc.rect(left, y, width, ROW).fill(STRIPE);
    const muted = d.status === "REJECTED";
    let x = left;
    for (const c of cols) {
      doc
        .font(c.bold?.(d) ? "bold" : "body")
        .fontSize(8)
        .fillColor(muted ? MUTED : INK);
      line(c.cell(d), x + 4, y + 5, c.width - 8, c.align);
      x += c.width;
    }
    doc
      .moveTo(left, y + ROW)
      .lineTo(left + width, y + ROW)
      .lineWidth(0.5)
      .strokeColor(RULE)
      .stroke();
    y += ROW;
  });

  // Page numbers (below the bottom margin, so lift it while writing or pdfkit would start a new page).
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("body").fontSize(7.5).fillColor(MUTED);
    const fy = doc.page.height - margin + 6;
    line("Edge Trading Academy · Deposits · net amounts count for commission", left, fy, width / 2);
    line(`Page ${i + 1} of ${pages.count}`, left + width / 2, fy, width / 2, "right");
    doc.page.margins.bottom = margin;
  }
  doc.end();
  return done;
}
