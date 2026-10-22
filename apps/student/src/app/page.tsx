import { redirect } from "next/navigation";

/** Redirect-only, so there is no UI to validate as instant. Signed-out visitors never get here (see proxy.ts). */
export const instant = false;

export default function Home() {
  redirect("/dashboard");
}
