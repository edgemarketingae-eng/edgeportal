import { library } from "@edge/config/eslint/library";

// Integrations are provider adapters only: no database access (dependencies are injected).
export default library({
  restrictedImports: [{ group: ["@edge/db", "@edge/services", "mongoose", "mongodb"], message: "Inject data access as a port instead." }],
});
