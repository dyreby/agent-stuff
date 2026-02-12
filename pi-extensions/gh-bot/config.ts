/**
 * Config & Keychain helpers for GitHub App authentication
 *
 * Provides storage layer for GitHub App credentials:
 * - Config file at ~/.config/gh-bot/config.json (appId, installationId)
 * - Private key in macOS Keychain via `security` CLI
 *
 * macOS only. Windows/Linux support can be added later with native credential stores.
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
}

// --- Paths ---

const CONFIG_DIR = path.join(os.homedir(), ".config", "gh-bot");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// Keychain identifiers
const KEYCHAIN_SERVICE = "gh-bot";
const KEYCHAIN_ACCOUNT = "private-key";

// --- Config File Helpers ---

/**
 * Read the config file. Returns null if file doesn't exist or is invalid.
 */
export async function readConfig(): Promise<GhBotConfig | null> {
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
 * Get the private key from macOS Keychain. Returns null if not found.
 */
export async function getPrivateKey(): Promise<string | null> {
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
