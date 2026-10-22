// Test environment (must be set before @edge/services reads env).
Object.assign(process.env, {
  NODE_ENV: "test",
  INTERNAL_API_TOKEN: "test-internal-token-0123456789abcdef",
  BETTER_AUTH_SECRET: "test-better-auth-secret-0123456789abcdef0123",
  MEDIA_SIGNING_SECRET: "test-media-secret-0123456789",
  STUDENT_APP_URL: "http://student.localhost:3000",
  CONSOLE_APP_URL: "http://console.localhost:3001",
  OTP_MODE: "mock",
  EMAIL_MODE: "console",
  PAYMENTS_MODE: "mock",
  ODOO_MODE: "mock",
  GOOGLE_MODE: "mock",
  MAILERLITE_MODE: "mock",
});
