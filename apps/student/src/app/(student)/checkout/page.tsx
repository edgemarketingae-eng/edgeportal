import { paymentRoutes } from "@edge/contracts";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout-form";
import { getPortal, load, requireStudent } from "@/lib/load";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  await requireStudent();
  const portal = await getPortal();
  if (!portal.enrollment) redirect("/dashboard");
  const options = await load(() => api(paymentRoutes.checkoutOptions));
  if (!options.canCheckout) redirect(options.canPayBalance ? "/checkout/balance" : "/dashboard");
  return (
    <>
      <PageHeader help="/docs/paying" title="Complete your enrollment" description={`${options.courseTitle} · ${options.batchName}`} />
      <CheckoutForm mode="first" options={options} />
    </>
  );
}
