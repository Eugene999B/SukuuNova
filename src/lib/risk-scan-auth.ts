import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const issuer = "https://token.actions.githubusercontent.com";
const keys = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks"));
export const RISK_SCAN_AUDIENCE = "sukuunova:risk-scan";
export function isRiskScanWorkflow(payload: JWTPayload) {
  return payload.repository_id === "1334027943"
    && payload.repository === "Eugene999B/SukuuNova"
    && payload.ref === "refs/heads/main"
    && payload.workflow_ref === "Eugene999B/SukuuNova/.github/workflows/risk-scan.yml@refs/heads/main"
    && ["schedule", "workflow_dispatch", "workflow_run"].includes(String(payload.event_name))
    && [
      "repo:Eugene999B/SukuuNova:ref:refs/heads/main",
      "repo:Eugene999B@194670606/SukuuNova@1334027943:ref:refs/heads/main",
    ].includes(String(payload.sub));
}
export async function authorizeRiskScan(header: string | null) {
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || token.length > 16_384) return false;
  const expected = process.env.RISK_SCAN_CRON_SECRET;
  if (expected && expected.length >= 32) {
    const a = Buffer.from(expected), b = Buffer.from(token);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  try {
    const { payload } = await jwtVerify(token, keys, { issuer, audience: RISK_SCAN_AUDIENCE, algorithms: ["RS256"], maxTokenAge: "10m", requiredClaims: ["exp", "iat", "sub"] });
    return isRiskScanWorkflow(payload);
  } catch { return false; }
}
