import { getViewer } from "@edge/web/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

/** Redirect-only, so there is no UI to validate as instant. Signed-out visitors never get here (see proxy.ts). */
export const instant = false;

export default function Home() {
  return (
    <Suspense>
      <GoHome />
    </Suspense>
  );
}

/** Signed-in CRM users land on the dashboard (or a required security step); everyone else goes to sign in. */
async function GoHome() {
  const v = await getViewer();
  const home = v?.homes.crm ?? "/login";
  redirect(home === "/" ? "/dashboard" : home);
  return null;
}
