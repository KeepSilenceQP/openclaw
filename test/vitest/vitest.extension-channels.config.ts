import {
  extensionChannelOverrideExcludeGlobs,
  extensionChannelTestInclude,
} from "./vitest.channel-paths.mjs";
import { createScopedVitestConfig } from "./vitest.scoped-config.ts";

/** Creates the extension channels Vitest project config. */
export function createExtensionChannelsVitestConfig(
  env: Record<string, string | undefined> = process.env,
) {
  return createScopedVitestConfig(extensionChannelTestInclude, {
    dir: "extensions",
    env,
    exclude: extensionChannelOverrideExcludeGlobs,
    name: "extension-channels",
    passWithNoTests: true,
  });
}

/** Default extension channels Vitest project config. */
export default createExtensionChannelsVitestConfig();
