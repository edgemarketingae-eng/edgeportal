import type { TestProject } from "vitest/node";
import { startReplSet } from "./harness";

export default async function setup(_project: TestProject) {
  const rs = await startReplSet();
  process.env.TEST_MONGODB_URI = rs.uri;
  return async () => {
    await rs.stop();
  };
}
