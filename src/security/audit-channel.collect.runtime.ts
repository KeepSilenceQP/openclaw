// Runtime boundary for security audit channel collect runtime behavior.
import { collectChannelSecurityFindings as collectChannelSecurityFindingsImpl } from "./audit-channel.js";

type CollectChannelSecurityFindings =
  typeof import("./audit-channel.js").collectChannelSecurityFindings;

export function collectChannelSecurityFindings(
  ...args: Parameters<CollectChannelSecurityFindings>
): ReturnType<CollectChannelSecurityFindings> {
  return collectChannelSecurityFindingsImpl(...args);
}
