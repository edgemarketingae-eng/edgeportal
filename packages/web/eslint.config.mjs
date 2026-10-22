import { library } from "@edge/config/eslint/library";

export default library({
  restrictedImports: [{ group: ["@edge/db", "@edge/services", "@edge/integrations", "@edge/jobs", "mongoose", "mongodb", "bullmq", "ioredis"], message: "The Next apps reach data only through the API." }],
});
