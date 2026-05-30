// Runtime-config reexports used by model commands and their tests.
export { getModelsCommandSecretTargetIds } from "../../cli/command-secret-targets.js";
export {
  getRuntimeConfig,
  getRuntimeConfigSourceSnapshot,
  setRuntimeConfigSnapshot,
  type OpenClawConfig,
} from "../../config/config.js";
