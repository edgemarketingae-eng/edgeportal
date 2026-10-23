import { getViewer } from "@edge/web/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Set your password" };

export default function ChangePasswordPage() {
  return (
    <div className="grid gap-6">
      <Suspense>
        <Body />
      </Suspense>
    </div>
  );
}

async function Body() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const temporary = viewer.user.mustChangePassword;
  return (
    <>
      <div>
        <h2 className="font-display text-2xl uppercase">Set your password</h2>
        <p className="text-muted-foreground mt-1 text-sm">{temporary ? "Replace the temporary password you received before continuing." : "Change your account password."}</p>
      </div>
      <ChangePasswordForm temporary={temporary} />
    </>
  );
}
