/**
 * GitHub Bot Extension
 *
 * Provides GitHub App authentication for bot mode. When loaded, all `gh` CLI
 * commands authenticate as the GitHub App instead of your personal account.
 *
 * Intended for use via explicit path invocation (not auto-loaded):
 *   pi -e ./pi-extensions/gh-bot -p "issue #5: create a pr"
 *
 * Credentials are read from environment variables (CI) or macOS Keychain (local):
 *   - GH_BOT_APP_ID
 *   - GH_BOT_INSTALLATION_ID
 *   - GH_BOT_PRIVATE_KEY
 *
 * For setup, run: /gh-bot-setup
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { getInstallationToken } from "./auth.js";
import { readConfig, writeConfig, setPrivateKey, getPrivateKey, getAnthropicRefreshToken } from "./config.js";

/** Run gh command with value piped to stdin (for secrets) */
async function ghSecretSet(name: string, value: string, repo: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("gh", ["secret", "set", name, `--repo=${repo}`], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    proc.on("error", (err) => resolve({ code: 1, stderr: err.message }));
    proc.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    proc.stdin.write(value);
    proc.stdin.end();
  });
}

function botSystemPrompt(agent: string): string {
  return `
## Bot Mode

Confirmations for externally-visible actions (push, comment, review, etc.) are pre-approved. Execute directly.

When responding to issues or PRs, look for \`@${agent}\` mentions. The text following the mention is the prompt—execute it as if the human typed it directly.
`;
}

export default function ghBotExtension(pi: ExtensionAPI) {
  let botToken: string | null = null;
  let agent: string | null = null;

  // Register bash tool with spawnHook to inject GH_TOKEN
  const bashTool = createBashTool(process.cwd(), {
    spawnHook: ({ command, cwd, env }) => ({
      command,
      cwd,
      env: botToken ? { ...env, GH_TOKEN: botToken } : env,
    }),
  });
  pi.registerTool(bashTool);

  // Fetch token and activate on session start
  pi.on("session_start", async (_event, ctx) => {
    try {
      const config = await readConfig();
      agent = config?.agent ?? null;
      botToken = await getInstallationToken();
      ctx.ui.setStatus("gh-bot", "🤖 bot");
    } catch (err) {
      ctx.ui.notify(`gh-bot: failed to get token: ${err}`, "error");
    }
  });

  // Inject bot mode into system prompt
  pi.on("before_agent_start", async (event) => {
    if (botToken && agent) {
      return { systemPrompt: event.systemPrompt + botSystemPrompt(agent) };
    }
  });

  // Setup command for GitHub App configuration
  pi.registerCommand("gh-bot-setup", {
    description: "Configure GitHub App credentials for bot mode",
    handler: async (_args, ctx) => {
      ctx.ui.notify("GitHub App Setup", "info");
      ctx.ui.notify("Create or manage GitHub Apps: https://github.com/settings/apps", "info");

      // Load existing config for defaults
      const existing = await readConfig();

      // Get current gh user for human/agent defaults (without bot token)
      let ghUser: string | null = null;
      try {
        const result = await pi.exec("gh", ["api", "user", "--jq", ".login"]);
        if (result.code === 0 && result.stdout.trim()) {
          ghUser = result.stdout.trim();
        }
      } catch {
        // Ignore - will just not have defaults
      }

      // Get current repo for default
      let currentRepo: string | null = null;
      try {
        const result = await pi.exec("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
        if (result.code === 0 && result.stdout.trim()) {
          currentRepo = result.stdout.trim();
        }
      } catch {
        // Ignore - will just not have default
      }

      // Helper to prompt with default, returning value or default
      const promptWithDefault = async (
        label: string,
        defaultValue: string | undefined,
        required: boolean
      ): Promise<string | null> => {
        const displayDefault = defaultValue ?? "";
        const title = displayDefault ? `${label} [${displayDefault}]:` : `${label}:`;
        const result = await ctx.ui.input(title, displayDefault);
        const value = result?.trim() || defaultValue;
        if (!value && required) {
          ctx.ui.notify(`${label} is required (no default available)`, "error");
          return null;
        }
        return value ?? null;
      };

      // App ID (required, error if no default and empty)
      const appIdDefault = existing?.appId?.toString();
      const appIdStr = await promptWithDefault("App ID", appIdDefault, true);
      if (!appIdStr) return;
      const appId = parseInt(appIdStr, 10);
      if (isNaN(appId) || appId <= 0) {
        ctx.ui.notify("Invalid App ID (must be a positive number)", "error");
        return;
      }

      // Installation ID (required, error if no default and empty)
      const installIdDefault = existing?.installationId?.toString();
      const installIdStr = await promptWithDefault("Installation ID", installIdDefault, true);
      if (!installIdStr) return;
      const installationId = parseInt(installIdStr, 10);
      if (isNaN(installationId) || installationId <= 0) {
        ctx.ui.notify("Invalid Installation ID (must be a positive number)", "error");
        return;
      }

      // Human (default to gh user)
      const humanDefault = existing?.human ?? ghUser ?? undefined;
      const human = await promptWithDefault("Human (your GitHub login)", humanDefault, true);
      if (!human) return;

      // Agent (default to gh user + "-agent", this is the GitHub App name)
      const agentDefault = existing?.agent ?? (ghUser ? `${ghUser}-agent` : undefined);
      const agentName = await promptWithDefault("Agent (GitHub App name)", agentDefault, true);
      if (!agentName) return;

      // Target repo (default to current repo)
      const repoDefault = existing?.repo ?? currentRepo ?? undefined;
      const repo = await promptWithDefault("Target repo (owner/repo)", repoDefault, true);
      if (!repo) return;
      if (!repo.includes("/")) {
        ctx.ui.notify("Invalid repo format (must be owner/repo)", "error");
        return;
      }

      // Private key (multi-line PEM) - only prompt if not already set
      const existingKey = await getPrivateKey();
      let privateKey = existingKey;
      if (existingKey) {
        const updateKey = await ctx.ui.confirm("Private key exists", "Update the private key?");
        if (updateKey) {
          privateKey = await ctx.ui.editor("Paste your GitHub App private key (PEM format):", "");
        }
      } else {
        privateKey = await ctx.ui.editor("Paste your GitHub App private key (PEM format):", "");
      }

      if (!privateKey || !privateKey.includes("-----BEGIN") || !privateKey.includes("-----END")) {
        ctx.ui.notify("Invalid or empty private key", "error");
        return;
      }

      // Store credentials
      try {
        if (privateKey !== existingKey) {
          await setPrivateKey(privateKey);
        }
        await writeConfig({ appId, installationId, human, agent: agentName, repo });
        ctx.ui.notify("GitHub App configured successfully!", "info");
        
        // Activate immediately
        botToken = await getInstallationToken();
        ctx.ui.setStatus("gh-bot", "🤖 bot");
      } catch (err) {
        ctx.ui.notify(`Failed to save config: ${err}`, "error");
      }
    },
  });

  // Sync command to push local config to GitHub secrets/variables
  pi.registerCommand("gh-bot-sync", {
    description: "Sync local GitHub App config to GitHub repo secrets/variables",
    handler: async (_args, ctx) => {
      // Read all local sources
      const config = await readConfig();
      if (!config || !config.appId || !config.installationId || !config.human || !config.agent || !config.repo) {
        ctx.ui.notify("Missing config. Run /gh-bot-setup first.", "error");
        return;
      }

      const privateKey = await getPrivateKey();
      if (!privateKey) {
        ctx.ui.notify("Private key not found in Keychain. Run /gh-bot-setup first.", "error");
        return;
      }

      const anthropicToken = await getAnthropicRefreshToken();
      if (!anthropicToken) {
        ctx.ui.notify("Anthropic refresh token not found in ~/.pi/agent/auth.json", "error");
        return;
      }

      // Show summary (names only, no values)
      ctx.ui.notify(`Target: ${config.repo}`, "info");
      ctx.ui.notify("Variables: GH_BOT_APP_ID, GH_BOT_INSTALLATION_ID, GH_BOT_HUMAN, GH_BOT_AGENT", "info");
      ctx.ui.notify("Secrets: GH_BOT_PRIVATE_KEY, ANTHROPIC_REFRESH_TOKEN", "info");

      const confirmed = await ctx.ui.confirm("Sync to GitHub?", `Push all variables and secrets to ${config.repo}?`);
      if (!confirmed) {
        ctx.ui.notify("Sync cancelled", "warning");
        return;
      }

      const repoArg = `--repo=${config.repo}`;

      // Set variables
      const variables = [
        ["GH_BOT_APP_ID", config.appId.toString()],
        ["GH_BOT_INSTALLATION_ID", config.installationId.toString()],
        ["GH_BOT_HUMAN", config.human],
        ["GH_BOT_AGENT", config.agent],
      ];

      for (const [name, value] of variables) {
        const result = await pi.exec("gh", ["variable", "set", name, "--body", value, repoArg]);
        if (result.code !== 0) {
          ctx.ui.notify(`Failed to set ${name}: ${result.stderr}`, "error");
          return;
        }
        ctx.ui.notify(`✓ ${name}`, "info");
      }

      // Set secrets (pipe via stdin to avoid command-line exposure)
      const secrets = [
        ["GH_BOT_PRIVATE_KEY", privateKey],
        ["ANTHROPIC_REFRESH_TOKEN", anthropicToken],
      ];

      for (const [name, value] of secrets) {
        const result = await ghSecretSet(name, value, config.repo);
        if (result.code !== 0) {
          ctx.ui.notify(`Failed to set ${name}: ${result.stderr}`, "error");
          return;
        }
        ctx.ui.notify(`✓ ${name} (secret)`, "info");
      }

      ctx.ui.notify("Sync complete!", "info");
    },
  });
}
