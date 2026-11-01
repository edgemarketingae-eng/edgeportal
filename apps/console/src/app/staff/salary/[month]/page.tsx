import { hrRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { formatMonth } from "@edge/domain/hr/calendar";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { PayslipCard } from "@/components/hr/payslip-card";
import { PrintButton } from "@/components/hr/print-button";
import { load, requireStaff } from "@/lib/load";

export async function generateMetadata(props: PageProps<"/staff/salary/[month]">): Promise<Metadata> {
  const { month } = await props.params;
  return { title: `Payslip ${month}` };
}

export default async function PayslipPage(props: PageProps<"/staff/salary/[month]">) {
  await requireStaff();
  const { month } = await props.params;
  const s = await load(() => api(hrRoutes.myPayslip, { params: { month } }));
  return (
    <>
      <PageHeader
        back={{ href: "/staff/salary", label: "My salary" }}
        title={`Payslip, ${formatMonth(s.month)}`}
        description={s.closedAt ? `Issued ${formatDate(s.closedAt)}` : undefined}
        actions={<PrintButton />}
      />
      <PayslipCard slip={s} />
    </>
  );
}
