import { getViewer } from "@edge/web/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  "no-access": "Your account does not have access to the CRM. Ask a CRM admin for a sales role.",
  student: "Students sign in on the student portal.",
  forbidden: "You do not have permission for that page.",
  disabled: "This account is disabled.",
};

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-display text-2xl uppercase">Sign in to the CRM</h2>
        <p className="text-muted-foreground mt-1 text-sm">Sales executives, project managers and CRM managers.</p>
      </div>
      <Suspense>
        <Notices searchParams={props.searchParams} />
      </Suspense>
      <LoginForm />
    </div>
  );
}

async function Notices({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (viewer?.homes.crm && !sp.error) redirect(viewer.homes.crm);
  const notice = typeof sp.error === "string" ? NOTICES[sp.error] : undefined;
  return (
    <>
      {sp.reset ? <p className="bg-edge-mint/50 text-edge-emerald rounded-md px-3 py-2 text-sm">Password updated. Sign in with your new password.</p> : null}
      {notice ? <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{notice}</p> : null}
    </>
  );
}
