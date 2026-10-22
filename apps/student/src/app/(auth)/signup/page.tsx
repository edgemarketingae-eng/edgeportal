import { studentRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { api, getViewer } from "@edge/web/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-display text-2xl uppercase">Join Edge Academy</h2>
        <Suspense fallback={<p className="text-muted-foreground mt-1 text-sm">&nbsp;</p>}>
          <EnrollingNow />
        </Suspense>
      </div>
      <SignUpForm />
    </div>
  );
}

async function EnrollingNow() {
  const viewer = await getViewer();
  if (viewer) redirect(viewer.homes.student ?? "/dashboard");
  const { batch } = await api(studentRoutes.enrollingNow);
  return (
    <p className="text-muted-foreground mt-1 text-sm">
      {batch ? (
        <>
          Now enrolling: <span className="text-foreground font-semibold">{batch.name}</span> · starts {formatDate(batch.startDate)}
        </>
      ) : (
        "Create your account and we will let you know when the next batch opens."
      )}
    </p>
  );
}
