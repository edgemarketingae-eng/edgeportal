import { adminRoutes } from "@edge/contracts";
import { apiFetch } from "@edge/web/server";
import { redirect } from "next/navigation";

/** Streams the API's students CSV (same filters as the list page) with its download headers. */
export async function GET(request: Request) {
  const { search } = new URL(request.url);
  const res = await apiFetch(`${adminRoutes.studentsCsv.path}${search}`);
  if (res.status === 401) redirect("/login");
  if (res.status === 403) return new Response("Forbidden", { status: 403 });
  if (!res.ok) return new Response("Could not export students.", { status: res.status });
  const headers = new Headers();
  for (const name of ["content-type", "content-disposition"]) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(res.body, { status: 200, headers });
}
