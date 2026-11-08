import { claudeRoutes } from "@edge/contracts";
import { Alert, AlertDescription, AlertTitle } from "@edge/ui/components/alert";
import { api, getViewer } from "@edge/web/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { load } from "@/lib/load";
import { ConnectForm } from "./connect-form";

export const metadata: Metadata = { title: "Connect Claude" };

/** Claude's sign-in lands here (from /authorize on the API): the person allows or denies it, signed in as themselves. */
export default function ConnectPage(props: PageProps<"/connect">) {
  return (
    <div className="grid gap-6">
      <Suspense>
        <Body searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/connect">["searchParams"] }) {
  const [sp, viewer] = await Promise.all([searchParams, getViewer()]);
  const id = typeof sp.request === "string" ? sp.request : "";
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/connect?request=${encodeURIComponent(id)}`)}`);
  if (!viewer.homes.crm || !viewer.staff)
    return (
      <Alert variant="destructive">
        <AlertTitle>This account can&apos;t use the CRM</AlertTitle>
        <AlertDescription>Sign in with your CRM account to connect Claude, or ask a CRM admin for a sales role.</AlertDescription>
      </Alert>
    );
  // A temporary password or required two-factor comes first; connect again from Claude afterwards.
  if (viewer.homes.crm !== "/") redirect(viewer.homes.crm);
  if (!id)
    return (
      <Alert>
        <AlertTitle>Nothing to connect</AlertTitle>
        <AlertDescription>Start from Claude: add the Edge CRM connector there and it will bring you to this page.</AlertDescription>
      </Alert>
    );
  const consent = await load(() => api(claudeRoutes.request, { params: { id } }));
  return <ConnectForm requestId={id} consent={consent} />;
}
