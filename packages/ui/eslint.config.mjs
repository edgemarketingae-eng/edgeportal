import { library } from "@edge/config/eslint/library";

export default library({
  restrictedImports: [{ group: ["node:*", "@edge/db", "@edge/services", "@edge/integrations", "@edge/jobs", "mongoose"], message: "@edge/ui runs in the browser." }],
});
