"use client";

import { authClient } from "@edge/web/auth-client";
import { useEffect } from "react";

/** Sign-out clears the session cookie through the Better Auth client, then hard-navigates to /login. */
export default function SignOutPage() {
  useEffect(() => {
    authClient.signOut().finally(() => window.location.replace("/login"));
  }, []);
  return <p className="text-muted-foreground m-auto text-sm">Signing you out…</p>;
}
