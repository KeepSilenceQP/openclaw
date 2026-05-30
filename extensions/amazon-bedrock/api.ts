/** Re-exported amazon-bedrock plugin public API, starting with merge Implicit Bedrock Provider. */
export { mergeImplicitBedrockProvider, resolveBedrockConfigApiKey } from "./discovery-shared.js";
/** Re-exported amazon-bedrock plugin public API. */
export {
  discoverBedrockModels,
  resetBedrockDiscoveryCacheForTest,
  resolveImplicitBedrockProvider,
} from "./discovery.js";
