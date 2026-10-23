/** Ports and URLs of the isolated e2e stack (separate from `pnpm dev` on 3000/3001/3002/4000). */
export const E2E = {
  apiPort: 4100,
  studentPort: 3100,
  consolePort: 3101,
  crmPort: 3102,
  api: "http://127.0.0.1:4100",
  student: "http://student.localhost:3100",
  console: "http://console.localhost:3101",
  crm: "http://crm.localhost:3102",
  internalToken: "e2e-internal-token-0123456789abcdef",
  redisDb: 14,
  staffPassword: "ChangeMe!2026",
};
