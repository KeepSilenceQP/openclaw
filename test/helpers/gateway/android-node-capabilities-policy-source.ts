import type { GatewayConnectionDetails } from "../../../src/gateway/call.js";

/** Remote gateway URLs need policy config; local loopback connections already trust local policy. */
export function shouldFetchRemotePolicyConfig(details: GatewayConnectionDetails): boolean {
  return details.urlSource !== "local loopback";
}
