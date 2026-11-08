import { safePath } from "@edge/web/actions";
import { getViewer } from "@edge/web/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

/** Redirect-only, so there is no UI to validate as instant. Signed-out visitors never get here (see proxy.ts). */
export const instant = false;

export default function Home(props: PageProps<"/">) {
  return (
    <Suspense>
      <GoHome searchParams={props.searchParams} />
    </Suspense>
  );
}

/**
 * Signed-in CRM users land on the dashboard, or on ?next= (where they were going before signing in), unless a required
 * security step comes first; everyone else goes to sign in.
 */
async function GoHome({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const [sp, v] = await Promise.all([searchParams, getViewer()]);
  const home = v?.homes.crm ?? "/login";
  redirect(home === "/" ? (safePath(sp.next) ?? "/dashboard") : home);
  return null;
}
