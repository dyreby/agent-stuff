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
import { getInstallationToken } from "./auth.js";
import { readConfig, writeConfig, setPrivateKey, getPrivateKey } from "./config.js";

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

}
