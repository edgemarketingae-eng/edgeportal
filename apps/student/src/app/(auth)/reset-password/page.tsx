import { Alert, AlertDescription } from "@edge/ui/components/alert";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage(props: PageProps<"/reset-password">) {
  return (
    <div className="grid gap-6">
      <h2 className="font-display text-2xl uppercase">Choose a new password</h2>
      <Suspense>
        <Body searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/reset-password">["searchParams"] }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : null;
  if (token && !sp.error) return <ResetPasswordForm token={token} />;
  return (
    <Alert variant="destructive">
      <AlertDescription>
        This reset link is invalid or has expired.{" "}
        <Link href="/forgot-password" className="underline">
          Request a new one
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
}
