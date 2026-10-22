import { existsSync } from "node:fs";
import path from "node:path";

/**
 * The monorepo root when running from source (apps start with cwd apps/<name>), else the cwd.
 * Used only for development defaults; Docker sets MEDIA_CACHE_DIR explicitly.
 */
export function workspaceRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
