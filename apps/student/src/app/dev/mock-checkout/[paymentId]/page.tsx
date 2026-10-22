import { paymentRoutes } from "@edge/contracts";
import { formatMoney } from "@edge/domain/money";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Skeleton } from "@edge/ui/components/skeleton";
import { api } from "@edge/web/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { load } from "@/lib/load";

/** Stand-in for a hosted checkout page (mock gateway). Development only; the API also refuses unless PAYMENTS_MODE=mock. */
export default function MockCheckoutPage(props: PageProps<"/dev/mock-checkout/[paymentId]">) {
  // Development and the e2e stack only (DEV_ROUTES=true also enables the API side of the mock gateway).
  if (process.env.NODE_ENV === "production" && process.env.DEV_ROUTES !== "true") notFound();
  return (
    <div className="bg-edge-ink flex min-h-svh items-center justify-center p-4">
      <Suspense fallback={<Skeleton className="h-80 w-full max-w-sm rounded-xl" />}>
        <MockCheckout params={props.params} />
      </Suspense>
    </div>
  );
}

async function MockCheckout({ params }: { params: PageProps<"/dev/mock-checkout/[paymentId]">["params"] }) {
  const { paymentId } = await params;
  const p = await load(() => api(paymentRoutes.studentPayment, { params: { id: paymentId } }));
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <p className="text-xs font-semibold tracking-widest text-amber-700 uppercase">Test gateway · {p.gateway}</p>
        <CardTitle className="text-2xl">{formatMoney(p.totalMinor, p.currency)}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Plain form post: the API processes a signed mock webhook, then redirects through the checkout return route. */}
        <form method="post" action={`/api/dev/mock-checkout/${p.id}`} className="grid gap-2">
          <Button name="outcome" value="succeeded" size="lg">
            Pay successfully
          </Button>
          <Button name="outcome" value="authorized" variant="secondary">
            Authorise only (pending capture)
          </Button>
          <Button name="outcome" value="failed" variant="outline">
            Decline card
          </Button>
          <Button name="outcome" value="abandon" variant="ghost">
            Cancel and go back
          </Button>
        </form>
        <p className="text-muted-foreground mt-4 text-xs">No real money moves. This page exists only in development and test mode.</p>
      </CardContent>
    </Card>
  );
}
