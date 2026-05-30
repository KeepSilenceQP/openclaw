// Runtime boundary for config/sessions main session runtime behavior.
import { getRuntimeConfig } from "../io.js";
import { resolveMainSessionKey } from "./main-session.js";

export function resolveMainSessionKeyFromConfig(): string {
  return resolveMainSessionKey(getRuntimeConfig());
}
