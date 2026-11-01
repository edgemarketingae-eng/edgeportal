import { library } from "@edge/config/eslint/library";

export default [{ ignores: ["android/**", ".expo/**", "expo-env.d.ts", "metro.config.js", "plugins/**"] }, ...library()];
