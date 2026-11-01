import { apiFetch } from "@edge/web/server";
import { redirect } from "next/navigation";

/** Serves a stored file through the API, which checks who's asking. The browser never sees a storage link. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const res = await apiFetch(`/api/v1/files/${encodeURIComponent(id)}`);
  if (res.status === 401) redirect("/login");
  if (!res.ok) return new Response("File not found.", { status: 404 });
  const headers = new Headers();
  for (const name of ["content-type", "content-disposition", "x-content-type-options", "cache-control"]) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(res.body, { status: 200, headers });
}
