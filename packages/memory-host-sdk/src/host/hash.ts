import crypto from "node:crypto";

/** Hashes text as lowercase SHA-256 hex. */
export function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
