import type { ToolDef } from "./kit";
import * as admin from "./admin";
import * as leads from "./leads";
import * as orientation from "./orientation";
import * as projects from "./projects";
import * as sales from "./sales";
import * as tasks from "./tasks";

/**
 * Every tool Claude can be offered: the one place to add or remove one. A test keeps the routes they call equal to
 * `mcpRoutes`. Each person sees only the tools their permissions allow (and only read tools on a read-only connection).
 */
export const TOOLS: readonly ToolDef[] = [
  ...Object.values(orientation),
  ...Object.values(leads),
  ...Object.values(sales),
  ...Object.values(tasks),
  ...Object.values(projects),
  ...Object.values(admin),
] as ToolDef[];

export * from "./kit";
