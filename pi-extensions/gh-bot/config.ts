/**
 * Config & Keychain helpers for GitHub App authentication
 *
 * Credentials are read from (in order):
 * 1. Environment variables (for CI/Linux):
 *    - GH_BOT_APP_ID
 *    - GH_BOT_INSTALLATION_ID
 *    - GH_BOT_PRIVATE_KEY
 * 2. Config file + macOS Keychain (for local dev):
 *    - ~/.config/gh-bot/config.json (appId, installationId)
 *    - Private key in Keychain via `security` CLI
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// --- Types ---

export interface GhBotConfig {
  appId: number;
  installationId?: number;
  human?: string;          // GitHub login of the human who can invoke the bot
  agent?: string;          // GitHub App name (acts as the bot identity)
  repo?: string;           // Target repo (e.g., "owner/repo")
}

// --- Paths ---

const CONFIG_DIR = path.join(os.homedir(), ".config", "gh-bot");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// Keychain identifiers
const KEYCHAIN_SERVICE = "gh-bot";
const KEYCHAIN_ACCOUNT = "private-key";

// Environment variable names
const ENV_APP_ID = "GH_BOT_APP_ID";
const ENV_INSTALLATION_ID = "GH_BOT_INSTALLATION_ID";
const ENV_PRIVATE_KEY = "GH_BOT_PRIVATE_KEY";
const ENV_HUMAN = "GH_BOT_HUMAN";
const ENV_AGENT = "GH_BOT_AGENT";

// --- Config Helpers ---

/**
 * Read config from environment variables or config file.
 * Environment variables take precedence (for CI/Linux).
 */
export async function readConfig(): Promise<GhBotConfig | null> {
  // Check environment variables first
  const envAppId = process.env[ENV_APP_ID];
  const envInstallId = process.env[ENV_INSTALLATION_ID];
  if (envAppId && envInstallId) {
    const appId = parseInt(envAppId, 10);
    const installationId = parseInt(envInstallId, 10);
    if (!isNaN(appId) && !isNaN(installationId)) {
      return {
        appId,
        installationId,
        human: process.env[ENV_HUMAN],
        agent: process.env[ENV_AGENT],
      };
    }
  }

  // Fall back to config file
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(content);

    // Validate required fields
    if (typeof parsed.appId !== "number") {
      return null;
    }

    return {
      appId: parsed.appId,
      installationId: typeof parsed.installationId === "number" ? parsed.installationId : undefined,
      human: typeof parsed.human === "string" ? parsed.human : undefined,
      agent: typeof parsed.agent === "string" ? parsed.agent : undefined,
      repo: typeof parsed.repo === "string" ? parsed.repo : undefined,
    };
  } catch {
    // File doesn't exist or can't be parsed
    return null;
  }
}

/**
 * Write the config file. Creates directory if missing.
 */
export async function writeConfig(config: GhBotConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// --- Keychain Helpers ---

/**
 * Get private key from environment variable or macOS Keychain.
 * Environment variable takes precedence (for CI/Linux).
 */
export async function getPrivateKey(): Promise<string | null> {
  // Check environment variable first (raw PEM)
  const envKey = process.env[ENV_PRIVATE_KEY];
  if (envKey) {
    return envKey;
  }

  // Fall back to macOS Keychain (base64-encoded)
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s", KEYCHAIN_SERVICE,
      "-a", KEYCHAIN_ACCOUNT,
      "-w",
    ]);
    return Buffer.from(stdout.trimEnd(), "base64").toString("utf-8");
  } catch {
    // Key not found or security command failed
    return null;
  }
}

/**
 * Store the private key in macOS Keychain. Updates if already exists.
 * Key is base64-encoded to avoid macOS Keychain hex-encoding multi-line values.
 */
export async function setPrivateKey(privateKey: string): Promise<void> {
  const encoded = Buffer.from(privateKey, "utf-8").toString("base64");
  await execFileAsync("security", [
    "add-generic-password",
    "-s", KEYCHAIN_SERVICE,
    "-a", KEYCHAIN_ACCOUNT,
    "-w", encoded,
    "-U", // Update if exists
  ]);
}

/**
 * Delete the private key from macOS Keychain. No-op if not found.
 */
export async function deletePrivateKey(): Promise<void> {
  try {
    await execFileAsync("security", [
      "delete-generic-password",
      "-s", KEYCHAIN_SERVICE,
      "-a", KEYCHAIN_ACCOUNT,
    ]);
  } catch {
    // Ignore errors (key might not exist)
  }
}


