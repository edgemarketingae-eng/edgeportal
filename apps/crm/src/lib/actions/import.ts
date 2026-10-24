"use server";

import { crmRoutes, type RouteBody } from "@edge/contracts";
import { text } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";
import type { ImportState } from "@/components/crm/import-types";
import { fail } from "./common";

async function csvFromForm(form: FormData) {
  const pasted = text(form, "csv");
  if (pasted) return pasted;
  const file = form.get("file");
  if (file && typeof file === "object" && "text" in file && (file as File).size > 0) return (await (file as File).text()).trim();
  return "";
}

export async function previewImportAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const csv = await csvFromForm(form);
  const vals = {
    csv,
    projectId: text(form, "projectId"),
    source: text(form, "source"),
    ownerId: text(form, "ownerId"),
    defaultCountry: text(form, "defaultCountry"),
  };
  if (!csv) return { error: "Paste CSV text or choose a file.", values: vals };
  try {
    const preview = await api(crmRoutes.importPreview, { body: { csv, defaultCountry: vals.defaultCountry } });
    return { ok: true, step: "preview", values: vals, preview };
  } catch (e) {
    return fail(e, vals);
  }
}

export async function importLeadsAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const csv = text(form, "csv");
  const vals = {
    csv,
    projectId: text(form, "projectId"),
    source: text(form, "source"),
    ownerId: text(form, "ownerId"),
    defaultCountry: text(form, "defaultCountry"),
  };
  try {
    const r = await api(crmRoutes.importCsv, {
      body: {
        csv,
        projectId: text(form, "projectId"),
        source: text(form, "source") as RouteBody<typeof crmRoutes.importCsv>["source"],
        ownerId: text(form, "ownerId") || undefined,
        defaultCountry: vals.defaultCountry,
      },
    });
    refresh();
    return { ok: true, step: "done", message: r.message, result: { created: r.created, skipped: r.skipped, invalid: r.invalid } };
  } catch (e) {
    return fail(e, vals);
  }
}
