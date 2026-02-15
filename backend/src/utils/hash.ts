import { createHash } from "crypto";

/**
 * Hash IP for storage (one vote per IP fairness).
 * We never store raw IPs; hashing limits exposure and allows uniqueness checks.
 */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}
