/**
 * GitHub App authentication module
 *
 * Implements the GitHub App auth flow:
 * 1. Sign JWT with private key (RS256)
 * 2. Exchange JWT for installation access token
 * 3. Cache token in memory (refresh on 401)
 */

import * as crypto from "node:crypto";
import { readConfig, getPrivateKey } from "./config.js";

// --- In-memory cache ---

let cachedToken: string | null = null;

// --- JWT Signing (RS256) ---

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64url");
}

function createJwt(appId: number, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: appId,
    iat: now - 60, // 1 min in past to account for clock drift
    exp: now + 600, // 10 min
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const unsigned = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(privateKey, "base64url");

  return `${unsigned}.${signature}`;
}

// --- Token Exchange ---

interface TokenResponse {
  token: string;
}

async function fetchInstallationToken(): Promise<string> {
  const config = await readConfig();
  if (!config) {
    throw new Error("GitHub App not configured. Run /gh-bot-setup first.");
  }
  if (!config.installationId) {
    throw new Error("Installation ID not configured. Run /gh-bot-setup first.");
  }

  const privateKey = await getPrivateKey();
  if (!privateKey) {
    throw new Error("Private key not found in Keychain. Run /gh-bot-setup first.");
  }

  const jwt = createJwt(config.appId, privateKey);
  const url = `https://api.github.com/app/installations/${config.installationId}/access_tokens`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as TokenResponse;
  return data.token;
}

// --- Public API ---

/**
 * Get an installation access token (cached).
 * Call clearTokenCache() and retry on 401.
 *
 * @throws Error if config is missing, private key not found, or API call fails
 */
export async function getInstallationToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken;
  }
  cachedToken = await fetchInstallationToken();
  return cachedToken;
}

/**
 * Clear the cached token. Call this on 401 before retrying.
 */
export function clearTokenCache(): void {
  cachedToken = null;
}
