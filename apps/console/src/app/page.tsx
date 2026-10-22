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

/** Staff land on their area (admin panel, staff portal, or a required security step). */
async function GoHome() {
  const v = await getViewer();
  redirect(v?.homes.console ?? "/login");
  return null;
}
