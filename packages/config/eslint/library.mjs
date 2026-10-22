import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** ESLint for TypeScript packages and Node apps. */
export function library({ restrictedImports = [] } = {}) {
  return tseslint.config(
    { ignores: ["dist/**", "coverage/**", "**/*.d.ts"] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      rules: {
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        "@typescript-eslint/no-explicit-any": "error",
        "no-restricted-imports": restrictedImports.length ? ["error", { patterns: restrictedImports }] : "off",
      },
    },
  );
}
