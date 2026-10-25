import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Client views fetch on mount and store the result; the React Compiler
      // rule flags that pattern even when the effect is the intended design.
      // Keep it visible as a warning instead of failing lint.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local scratch + agent logs (gitignored, not project source):
    ".tmp/**",
    ".agent-logs/**",
    "public/models/**",
  ]),
]);

export default eslintConfig;
