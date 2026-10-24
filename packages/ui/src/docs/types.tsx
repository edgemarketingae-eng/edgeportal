import type { Permission } from "@edge/domain/auth/permissions";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface DocSection {
  /** Anchor id, unique within the module. */
  id: string;
  title: string;
  body: ReactNode;
}

export interface DocModule {
  /** URL segment: /docs/<slug>. */
  slug: string;
  title: string;
  /** One sentence shown on the docs home card and under the title. */
  summary: string;
  icon: LucideIcon;
  /** Heading the module is grouped under on the docs home. */
  group: string;
  /** Shown to anyone holding at least one of these permissions; omit to show to everyone. */
  audience?: Permission[];
  /** The page in the app this module explains, for an "Open" button. */
  href?: string;
  sections: DocSection[];
}

export function visibleModules(modules: DocModule[], permissions?: readonly string[]) {
  return modules.filter((m) => !m.audience?.length || (permissions && m.audience.some((p) => permissions.includes(p))));
}
