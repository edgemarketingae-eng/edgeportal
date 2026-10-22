import { defineConfig } from "tsdown";

// Bundle our own @edge/* TypeScript into dist; every third-party package (including transitive
// ones such as mongoose) stays external and is resolved from node_modules at runtime. Bundling the
// MongoDB driver would create a second copy next to Better Auth's adapter.
export default defineConfig({
  entry: ["src/index.ts", "src/scripts/migrate.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  sourcemap: true,
  deps: { neverBundle: true, alwaysBundle: [/^@edge\//] },
});
