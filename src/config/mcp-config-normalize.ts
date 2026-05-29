// config mcp config normalize helpers and runtime behavior.
import { isRecord } from "../utils.js";

type ConfigMcpServers = Record<string, Record<string, unknown>>;
type OpenClawMcpHttpTransport = "sse" | "streamable-http";

const CLI_MCP_TYPE_TO_OPENCLAW_TRANSPORT: Record<string, OpenClawMcpHttpTransport | "stdio"> = {
  http: "streamable-http",
  "streamable-http": "streamable-http",
  sse: "sse",
  stdio: "stdio",
};

function normalizeMcpString(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Reused helper for resolve Open Claw Mcp Transport Alias behavior in src/config. */
export function resolveOpenClawMcpTransportAlias(
  value: unknown,
): OpenClawMcpHttpTransport | undefined {
  const mapped = CLI_MCP_TYPE_TO_OPENCLAW_TRANSPORT[normalizeMcpString(value)];
  return mapped === "sse" || mapped === "streamable-http" ? mapped : undefined;
}

/** Reused helper for is Known Cli Mcp Type Alias behavior in src/config. */
export function isKnownCliMcpTypeAlias(value: unknown): boolean {
  return Object.hasOwn(CLI_MCP_TYPE_TO_OPENCLAW_TRANSPORT, normalizeMcpString(value));
}

/** Reused helper for canonicalize Configured Mcp Server behavior in src/config. */
export function canonicalizeConfiguredMcpServer(
  server: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...server };
  const transportAlias = resolveOpenClawMcpTransportAlias(next.type);
  if (typeof next.transport !== "string" && transportAlias) {
    next.transport = transportAlias;
  }
  if (isKnownCliMcpTypeAlias(next.type)) {
    delete next.type;
  }
  if (typeof next.connect_timeout === "number" && typeof next.connectTimeout !== "number") {
    next.connectTimeout = next.connect_timeout;
    delete next.connect_timeout;
  }
  if (
    typeof next.supports_parallel_tool_calls === "boolean" &&
    typeof next.supportsParallelToolCalls !== "boolean"
  ) {
    next.supportsParallelToolCalls = next.supports_parallel_tool_calls;
    delete next.supports_parallel_tool_calls;
  }
  if (typeof next.ssl_verify === "boolean" && typeof next.sslVerify !== "boolean") {
    next.sslVerify = next.ssl_verify;
    delete next.ssl_verify;
  }
  if (typeof next.client_cert === "string" && typeof next.clientCert !== "string") {
    next.clientCert = next.client_cert;
    delete next.client_cert;
  }
  if (typeof next.client_key === "string" && typeof next.clientKey !== "string") {
    next.clientKey = next.client_key;
    delete next.client_key;
  }
  return next;
}

/** Reused helper for normalize Configured Mcp Servers behavior in src/config. */
export function normalizeConfiguredMcpServers(value: unknown): ConfigMcpServers {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, server]) => isRecord(server))
      .map(([name, server]) => [name, { ...(server as Record<string, unknown>) }]),
  );
}
