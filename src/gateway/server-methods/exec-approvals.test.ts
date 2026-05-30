import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { NodeSession } from "../node-registry.js";
import { execApprovalsHandlers } from "./exec-approvals.js";
import type {
  GatewayRequestContext,
  GatewayRequestHandlerOptions,
  RespondFn,
} from "./shared-types.js";

type GatewayResponse = {
  ok: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string; details?: unknown };
};

function makeNodeSession(commands: string[]): NodeSession {
  return {
    nodeId: "node-1",
    connId: "conn-1",
    client: {} as NodeSession["client"],
    clientId: "node-host",
    clientMode: "node",
    displayName: "Windows test node",
    platform: "windows",
    deviceFamily: "Windows",
    declaredCaps: [],
    caps: [],
    declaredCommands: [...commands],
    commands: [...commands],
    connectedAtMs: Date.now(),
  };
}

async function callNodeApprovalHandler(params: {
  method: "exec.approvals.node.get" | "exec.approvals.node.set";
  nodeSession?: NodeSession;
  invoke?: GatewayRequestContext["nodeRegistry"]["invoke"];
  requestParams?: Record<string, unknown>;
}): Promise<{
  response: GatewayResponse;
  invoke: GatewayRequestContext["nodeRegistry"]["invoke"];
}> {
  let response: GatewayResponse | undefined;
  const respond: RespondFn = (ok, payload, error) => {
    response = {
      ok,
      ...(payload !== undefined ? { payload } : {}),
      ...(error ? { error } : {}),
    };
  };
  const invoke =
    params.invoke ??
    vi.fn(async () => ({
      ok: true,
      payloadJSON: JSON.stringify({ ok: true }),
    }));
  const context = {
    getRuntimeConfig: () => ({ gateway: {} }) as OpenClawConfig,
    nodeRegistry: {
      get: vi.fn(() => params.nodeSession),
      invoke,
    },
  } as unknown as GatewayRequestContext;
  const defaultParams =
    params.method === "exec.approvals.node.get"
      ? { nodeId: "node-1" }
      : {
          nodeId: "node-1",
          native: {
            defaultAction: "deny",
            rules: [{ pattern: "cmd.exe *", action: "allow", enabled: true }],
          },
          baseHash: "hash-1",
        };

  await execApprovalsHandlers[params.method]({
    req: { type: "req", id: "req-1", method: params.method },
    params: params.requestParams ?? defaultParams,
    client: null,
    isWebchatConnect: () => false,
    respond,
    context,
  } as GatewayRequestHandlerOptions);

  if (!response) {
    throw new Error("handler did not respond");
  }
  return { response, invoke };
}

describe("exec approvals node RPC authorization", () => {
  it("does not forward node approval reads before the command is approved for the node", async () => {
    const { response, invoke } = await callNodeApprovalHandler({
      method: "exec.approvals.node.get",
      nodeSession: makeNodeSession([]),
    });

    expect(response.ok).toBe(false);
    expect(response.error?.message).toContain('"system.execApprovals.get" is not in the allowlist');
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not forward node approval writes before the command is approved for the node", async () => {
    const { response, invoke } = await callNodeApprovalHandler({
      method: "exec.approvals.node.set",
      nodeSession: makeNodeSession(["system.execApprovals.get"]),
    });

    expect(response.ok).toBe(false);
    expect(response.error?.message).toContain('"system.execApprovals.set" is not in the allowlist');
    expect(invoke).not.toHaveBeenCalled();
  });

  it("forwards node approval RPCs after the node command is approved", async () => {
    const commands = ["system.execApprovals.get", "system.execApprovals.set"];
    const get = await callNodeApprovalHandler({
      method: "exec.approvals.node.get",
      nodeSession: makeNodeSession(commands),
    });
    const set = await callNodeApprovalHandler({
      method: "exec.approvals.node.set",
      nodeSession: makeNodeSession(commands),
    });

    expect(get.response.ok).toBe(true);
    expect(get.invoke).toHaveBeenCalledWith({
      nodeId: "node-1",
      command: "system.execApprovals.get",
      params: {},
    });
    expect(set.response.ok).toBe(true);
    expect(set.invoke).toHaveBeenCalledWith({
      nodeId: "node-1",
      command: "system.execApprovals.set",
      params: {
        defaultAction: "deny",
        rules: [{ pattern: "cmd.exe *", action: "allow", enabled: true }],
        baseHash: "hash-1",
      },
    });
  });
});
