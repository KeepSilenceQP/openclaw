import { commandsLightTestFiles } from "./vitest.commands-light-paths.mjs";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

/** Create the scoped Vitest config for command tests excluding commands-light files. */
export function createCommandsVitestConfig(env?: Record<string, string | undefined>) {
  return createScopedVitestConfig(["src/commands/**/*.test.ts"], {
    dir: "src/commands",
    env,
    exclude: commandsLightTestFiles,
    fileParallelism: false,
    name: "commands",
    pool: "forks",
  });
}

/** Default commands Vitest project configuration. */
export default createCommandsVitestConfig();
