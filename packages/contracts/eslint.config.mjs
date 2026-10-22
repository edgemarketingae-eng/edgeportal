import { library } from "@edge/config/eslint/library";

export default library({
  restrictedImports: [{ group: ["node:*", "mongoose", "mongodb", "express"], message: "@edge/contracts is shared with the browser apps." }],
});
