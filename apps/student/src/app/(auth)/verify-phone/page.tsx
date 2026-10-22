import { getViewer } from "@edge/web/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { VerifyPhoneForm } from "./verify-phone-form";

export const metadata: Metadata = { title: "Verify your mobile" };

export default function VerifyPhonePage() {
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-display text-2xl uppercase">Verify your mobile</h2>
        <p className="text-muted-foreground mt-1 text-sm">One last step. We use this number for class updates and secure sign-in.</p>
      </div>
      <Suspense>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const pending = viewer.student?.pendingPhone;
  if (!viewer.student || (!pending && viewer.user.phoneNumberVerified)) redirect("/dashboard");
  return <VerifyPhoneForm phone={pending ?? viewer.user.phoneNumber ?? ""} />;
}
