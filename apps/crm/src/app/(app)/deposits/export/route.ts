import { crmRoutes } from "@edge/contracts";
import { apiFetch } from "@edge/web/server";
import { redirect } from "next/navigation";

/** Streams the API's deposits export (same filters as the list page) with its download headers: CSV, or `format=pdf`. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const pdf = url.searchParams.get("format") === "pdf";
  url.searchParams.delete("format");
  const res = await apiFetch(`${(pdf ? crmRoutes.depositsPdf : crmRoutes.depositsCsv).path}${url.search}`);
  if (res.status === 401) redirect("/login");
  if (res.status === 403) return new Response("Forbidden", { status: 403 });
  if (!res.ok) return new Response("Could not export deposits.", { status: res.status });
  const headers = new Headers();
  for (const name of ["content-type", "content-disposition"]) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(res.body, { status: 200, headers });
}
