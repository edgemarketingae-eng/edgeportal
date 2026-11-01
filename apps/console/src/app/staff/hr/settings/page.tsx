import { hrRoutes } from "@edge/contracts";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { HrSettingsForm } from "@/components/hr/settings-form";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "HR settings" };

export default async function HrSettingsPage() {
  await requireStaff("hr.settings");
  const s = await load(() => api(hrRoutes.settings));
  return (
    <>
      <PageHeader
        help="/staff/docs/hr-settings"
        title="HR settings"
        description="Leave rules, weekly off and holidays for the whole company. A person's own rules go on their Team page."
      />
      <HrSettingsForm key={JSON.stringify(s)} settings={s} />
    </>
  );
}
