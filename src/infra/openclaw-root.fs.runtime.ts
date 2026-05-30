// Centralizes fs imports used by openclaw-root helpers so tests can replace the
export { default as openClawRootFsSync } from "node:fs";
export { default as openClawRootFs } from "node:fs/promises";
