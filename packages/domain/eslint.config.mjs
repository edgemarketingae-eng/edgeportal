import { library } from "@edge/config/eslint/library";

// The domain package must stay pure and browser-safe.
export default library({
  restrictedImports: [{ group: ["node:*", "mongoose", "mongodb", "express", "bullmq", "ioredis"], message: "@edge/domain must stay pure (no I/O, no Node built-ins)." }],
});
