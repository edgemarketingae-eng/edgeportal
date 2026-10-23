import type { ImportPreviewDto } from "@edge/contracts";
import { AuthUser, Lead, StudentProfile } from "@edge/db";
import type { LeadSource } from "@edge/domain/crm/enums";
import { csvToObjects } from "@edge/domain/csv";
import type { Actor } from "@edge/domain/enums";
import { parsePhone } from "@edge/domain/phone";
import { audit } from "../audit";
import { BusinessError, ValidationError } from "../errors";
import { createLead } from "./leads";
import type { CrmScope } from "./scope";

const MAX_ROWS = 2000;

/** Accepted column names (case-insensitive) for each lead field. */
const COLUMNS: Record<"name" | "phone" | "email" | "country" | "notes" | "tags" | "sourceDetail" | "language", string[]> = {
  name: ["name", "full name", "fullname", "lead", "student", "contact"],
  phone: ["phone", "mobile", "mobile number", "phone number", "whatsapp", "number", "tel"],
  email: ["email", "e-mail", "email address", "mail"],
  country: ["country", "country code"],
  notes: ["notes", "note", "message", "remarks", "comments", "comment"],
  tags: ["tags", "tag", "labels"],
  sourceDetail: ["source detail", "source", "campaign", "ad", "channel"],
  language: ["language", "lang"],
};

function pick(obj: Record<string, string>, field: keyof typeof COLUMNS) {
  for (const k of COLUMNS[field]) if (obj[k] !== undefined && obj[k] !== "") return obj[k];
  return "";
}

interface ParsedRow {
  row: number;
  name: string;
  phone: string | null;
  email: string | null;
  country: string;
  notes: string;
  tags: string;
  sourceDetail: string;
  language: string;
  error: string | null;
}

function parseRows(csv: string): ParsedRow[] {
  const { headers, rows } = csvToObjects(csv);
  if (!headers.some((h) => COLUMNS.name.includes(h))) throw new ValidationError({ csv: "The first row must contain a 'name' column (plus phone and/or email)" });
  if (rows.length > MAX_ROWS) throw new ValidationError({ csv: `Import at most ${MAX_ROWS} rows at a time (${rows.length} given)` });
  return rows.map((obj, i) => {
    const name = pick(obj, "name").trim();
    const rawPhone = pick(obj, "phone").trim();
    const country = (pick(obj, "country").trim().toUpperCase() || "AE").slice(0, 2);
    const parsed = rawPhone ? parsePhone(rawPhone, country as never) : null;
    const email = pick(obj, "email").trim().toLowerCase() || null;
    let error: string | null = null;
    if (name.length < 2) error = "Missing name";
    else if (rawPhone && !parsed) error = `Invalid phone: ${rawPhone}`;
    else if (!parsed && !email) error = "No phone or email";
    else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = `Invalid email: ${email}`;
    return { row: i + 2, name, phone: parsed?.e164 ?? null, email, country: parsed?.country ?? country, notes: pick(obj, "notes"), tags: pick(obj, "tags"), sourceDetail: pick(obj, "sourceDetail"), language: pick(obj, "language"), error };
  });
}

/** Which rows would be created, which already exist (lead or student) and which are invalid. */
export async function previewImport(csv: string): Promise<ImportPreviewDto> {
  const rows = parseRows(csv);
  const phones = rows.map((r) => r.phone).filter((x): x is string => !!x);
  const emails = rows.map((r) => r.email).filter((x): x is string => !!x);
  const [leads, users, pending] = await Promise.all([
    Lead.find({ mergedIntoId: null, $or: [{ phone: { $in: phones } }, { email: { $in: emails } }] }, { phone: 1, email: 1, name: 1 }).lean(),
    AuthUser.find({ $or: [{ phoneNumber: { $in: phones } }, { email: { $in: emails } }] }, { phoneNumber: 1, email: 1, name: 1 }).lean(),
    StudentProfile.find({ pendingPhone: { $in: phones } }, { pendingPhone: 1 }).lean(),
  ]);
  const leadByPhone = new Map(leads.filter((l) => l.phone).map((l) => [l.phone!, l.name]));
  const leadByEmail = new Map(leads.filter((l) => l.email).map((l) => [l.email!, l.name]));
  const userPhones = new Set([...users.map((u) => u.phoneNumber).filter(Boolean), ...pending.map((p) => p.pendingPhone)]);
  const userEmails = new Set(users.map((u) => u.email));
  const seenPhone = new Set<string>();
  const seenEmail = new Set<string>();
  const out = rows.map((r) => {
    let status: "ok" | "duplicate" | "invalid" = "ok";
    let reason: string | null = r.error;
    if (reason) status = "invalid";
    else if ((r.phone && leadByPhone.has(r.phone)) || (r.email && leadByEmail.has(r.email))) {
      status = "duplicate";
      reason = `Lead exists: ${(r.phone && leadByPhone.get(r.phone)) || (r.email && leadByEmail.get(r.email))}`;
    } else if ((r.phone && userPhones.has(r.phone)) || (r.email && userEmails.has(r.email))) {
      status = "duplicate";
      reason = "Already a portal account";
    } else if ((r.phone && seenPhone.has(r.phone)) || (r.email && seenEmail.has(r.email))) {
      status = "duplicate";
      reason = "Repeated in this file";
    }
    if (r.phone) seenPhone.add(r.phone);
    if (r.email) seenEmail.add(r.email);
    return { row: r.row, name: r.name, phone: r.phone, email: r.email, status, reason };
  });
  return {
    total: out.length,
    valid: out.filter((r) => r.status === "ok").length,
    duplicates: out.filter((r) => r.status === "duplicate").length,
    invalid: out.filter((r) => r.status === "invalid").length,
    rows: out.slice(0, 500),
  };
}

/** Create a lead per valid row; duplicates (lead, account, or earlier row) are skipped, never merged. */
export async function importLeads(csv: string, o: { projectId: string; source: LeadSource; ownerId?: string }, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const rows = parseRows(csv);
  let created = 0;
  let skipped = 0;
  let invalid = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.error) {
      invalid++;
      continue;
    }
    const key = r.phone ?? r.email!;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    try {
      await createLead(
        {
          projectId: o.projectId,
          name: r.name,
          phone: r.phone ?? undefined,
          email: r.email ?? undefined,
          country: r.country,
          source: o.source,
          sourceDetail: r.sourceDetail || undefined,
          notes: r.notes || undefined,
          tags: r.tags || undefined,
          language: r.language || undefined,
          ownerId: o.ownerId ?? "",
        },
        actor,
        scope,
        { createdAs: "IMPORTED" },
      );
      created++;
    } catch (e) {
      if (e instanceof BusinessError) skipped++;
      else if (e instanceof ValidationError) invalid++;
      else throw e;
    }
  }
  await audit({ actor, action: "lead.import", entityType: "Lead", entityId: "import", after: { projectId: o.projectId, source: o.source, rows: rows.length, created, skipped, invalid } });
  return { created, skipped, invalid };
}
