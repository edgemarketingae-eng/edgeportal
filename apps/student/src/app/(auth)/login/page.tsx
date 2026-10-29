import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { getViewer } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  "no-access": "Your account does not have access to the student portal. Contact the academy.",
  staff: "Staff accounts sign in on the staff console.",
};

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-display text-2xl uppercase">Sign in</h2>
        <p className="text-muted-foreground mt-1 text-sm">Welcome back. Sign in with your password or a one-time code.</p>
      </div>
      <Suspense>
        <Notices searchParams={props.searchParams} />
      </Suspense>
      <LoginForm />
      <p className="text-muted-foreground text-center text-sm">
        New student?{" "}
        <Link href="/signup" className="text-edge-emerald font-semibold underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

/** Signed-in visitors skip the form; notices come from redirects (?error=, ?reset=). */
async function Notices({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (viewer && !sp.error) redirect(viewer.homes.student ?? "/dashboard");
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
