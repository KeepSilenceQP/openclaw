// Public facade for the voice-call plugin. Keep this barrel limited to SDK
// contracts and narrow runtime helpers that core/plugin discovery can import
export {
  definePluginEntry,
  fetchWithSsrFGuard,
  type GatewayRequestHandlerOptions,
  isBlockedHostnameOrIp,
  isRequestBodyLimitError,
  type OpenClawPluginApi,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
  type SessionEntry,
  sleep,
  TtsAutoSchema,
  TtsConfigSchema,
  TtsModeSchema,
  TtsProviderSchema,
} from "./runtime-api.js";
