import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { getViewer } from "@edge/web/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in" };

const NOTICES: Record<string, string> = {
  "no-access": "Your account does not have access to the console. Contact an administrator.",
  student: "Students sign in on the student portal.",
  disabled: "This account is disabled.",
};

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-display text-2xl uppercase">Staff sign in</h2>
        <p className="text-muted-foreground mt-1 text-sm">Mentors, admissions, finance and admins.</p>
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
  if (viewer?.homes.console && !sp.error) redirect(viewer.homes.console);
  const notice = typeof sp.error === "string" ? NOTICES[sp.error] : undefined;
  return (
    <>
      {sp.reset ? (
        <Alert variant="success">
          <AlertDescription>Password updated. Sign in with your new password.</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant="destructive">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
