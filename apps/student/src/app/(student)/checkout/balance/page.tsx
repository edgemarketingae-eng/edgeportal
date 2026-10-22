import { paymentRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout-form";
import { getPortal, load, requireStudent } from "@/lib/load";

export const metadata: Metadata = { title: "Pay balance" };

export default async function BalancePage() {
  await requireStudent();
  const portal = await getPortal();
  if (!portal.enrollment) redirect("/dashboard");
  const options = await load(() => api(paymentRoutes.checkoutOptions));
  if (!options.canPayBalance) redirect(options.canCheckout ? "/checkout" : "/dashboard");
  return (
    <>
      <PageHeader title="Pay your balance" description={options.balanceDueOn ? `Due by ${formatDate(options.balanceDueOn)}` : undefined} />
      <CheckoutForm mode="balance" options={options} />
    </>
  );
}
