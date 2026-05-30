import { createUnitVitestConfigWithOptions } from "./vitest.unit.config.ts";

/** Default unit security Vitest project config. */
export default createUnitVitestConfigWithOptions(process.env, {
  name: "unit-security",
  includePatterns: ["src/security/**/*.test.ts"],
  passWithNoTests: true,
});
