import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * ESLint for the Next.js apps. Apps may only use the browser-safe packages
 * (@edge/domain, @edge/contracts, @edge/ui); everything server-side lives behind the API.
 */
export function next() {
  return [
    ...nextVitals,
    ...nextTs,
    { ignores: [".next/**", ".next-*/**", "next-env.d.ts"] }, // .next-e2e: the e2e stack build
    {
      rules: {
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              { group: ["@edge/db", "@edge/db/*", "@edge/services", "@edge/services/*", "@edge/integrations", "@edge/integrations/*", "@edge/jobs", "@edge/jobs/*"], message: "Next apps talk to the API; they must not import server packages." },
              { group: ["mongoose", "mongodb", "bullmq", "ioredis"], message: "Data access belongs to the API." },
            ],
          },
        ],
      },
    },
  ];
}
