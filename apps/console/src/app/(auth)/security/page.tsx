import { getViewer } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TwoFactorSetup } from "./two-factor-setup";

export const metadata: Metadata = { title: "Account security" };

export default function SecurityPage(props: PageProps<"/security">) {
  return (
    <div className="grid gap-6">
      <Suspense>
        <Body searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/security">["searchParams"] }) {
  const [sp, viewer] = await Promise.all([searchParams, getViewer()]);
  if (!viewer) redirect("/login");
  if (viewer.user.mustChangePassword) redirect("/change-password");
  const enabled = viewer.user.twoFactorEnabled;
  return (
    <>
      <div>
        <h2 className="font-display text-2xl uppercase">Two-factor authentication</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {sp.required ? "Admin accounts must use an authenticator app before opening the admin panel." : "Add a second step to your sign-in with an authenticator app."}
        </p>
      </div>
      {sp.disabled ? <p className="bg-edge-mint/40 text-edge-emerald rounded-md px-3 py-2 text-sm">Two-factor authentication is off.</p> : null}
      <TwoFactorSetup enabled={enabled} required={viewer.twoFactorRequired} />
      {enabled || !viewer.twoFactorRequired ? (
        <Link href="/" className="text-edge-emerald text-sm hover:underline">
          Continue
        </Link>
      ) : null}
    </>
  );
}
