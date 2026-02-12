/**
 * GitHub Bot Extension
 *
 * Provides a GitHub identity toggle via spawnHook:
 * - `/gh-bot off` (default): GitHub operations use your personal `gh` CLI auth
 * - `/gh-bot on`: GitHub operations use GitHub App credentials (appears as bot)
 *
 * Overrides the bash tool to inject GH_TOKEN when bot mode is active. Any
 * `gh` CLI commands the LLM runs via bash will authenticate as the bot.
 *
 * Usage:
 *   pi -e ./pi-extensions/gh-bot
 *
 * Commands:
 *   /gh-bot [on|off]     - Toggle bot identity for GitHub operations
 *   /gh-bot-setup        - Configure GitHub App credentials (appId, installationId, private key)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool } from "@mariozechner/pi-coding-agent";
import { getInstallationToken, clearTokenCache } from "./auth.js";
import { readConfig, writeConfig, setPrivateKey } from "./config.js";

// --- State ---

let botToken: string | null = null;

const BOT_SYSTEM_PROMPT = "If gh CLI commands fail with 401 or authentication errors, run /gh-bot on to refresh the token.";

// --- Extension ---

export default function ghBotExtension(pi: ExtensionAPI) {
  // Register bash tool with spawnHook to inject GH_TOKEN when bot mode is active
  const bashTool = createBashTool(process.cwd(), {
    spawnHook: ({ command, cwd, env }) => ({
      command,
      cwd,
      env: botToken ? { ...env, GH_TOKEN: botToken } : env,
    }),
  });
  pi.registerTool(bashTool);

  // Toggle command
  pi.registerCommand("gh-bot", {
    description: "Toggle GitHub bot identity (on/off)",
    handler: async (args, ctx) => {
      const arg = args?.trim().toLowerCase();
      const wantsOn = arg === "on" || (!arg && !botToken);

      if (wantsOn) {
        const config = await readConfig();
        if (!config) {
          ctx.ui.notify("GitHub App not configured. Run /gh-bot-setup first.", "error");
          return;
        }
        try {
          clearTokenCache();
          botToken = await getInstallationToken();
          pi.setSystemPrompt("gh-bot", BOT_SYSTEM_PROMPT);
          ctx.ui.setStatus("gh-bot", "🤖 bot");
          ctx.ui.notify("GitHub: bot (App)");
          pi.appendEntry("gh-bot", { enabled: true });
        } catch (err) {
          ctx.ui.notify(`Failed to get bot token: ${err}`, "error");
        }
      } else {
        botToken = null;
        clearTokenCache();
        pi.setSystemPrompt("gh-bot", undefined);
        ctx.ui.setStatus("gh-bot", undefined);
        ctx.ui.notify("GitHub: you (gh CLI)");
        pi.appendEntry("gh-bot", { enabled: false });
      }
    },
  });

  // Setup command
  pi.registerCommand("gh-bot-setup", {
    description: "Configure GitHub App credentials for bot mode",
    handler: async (_args, ctx) => {
      ctx.ui.notify("GitHub App Setup", "info");
      ctx.ui.notify("Create or manage GitHub Apps: https://github.com/settings/apps", "info");

      // App ID
      const appIdStr = await ctx.ui.input("App ID:", "");
      if (!appIdStr) {
        ctx.ui.notify("Setup cancelled", "warning");
        return;
      }
      const appId = parseInt(appIdStr, 10);
      if (isNaN(appId) || appId <= 0) {
        ctx.ui.notify("Invalid App ID (must be a positive number)", "error");
        return;
      }

      // Installation ID
      const installIdStr = await ctx.ui.input("Installation ID:", "");
      if (!installIdStr) {
        ctx.ui.notify("Setup cancelled", "warning");
        return;
      }
      const installationId = parseInt(installIdStr, 10);
      if (isNaN(installationId) || installationId <= 0) {
        ctx.ui.notify("Invalid Installation ID (must be a positive number)", "error");
        return;
      }

      // Private key (multi-line PEM)
      const privateKey = await ctx.ui.editor(
        "Paste your GitHub App private key (PEM format):",
        ""
      );
      if (!privateKey || !privateKey.includes("-----BEGIN") || !privateKey.includes("-----END")) {
        ctx.ui.notify("Invalid or empty private key", "error");
        return;
      }

      // Store credentials (key first, so partial failure doesn't leave broken config)
      try {
        await setPrivateKey(privateKey);
        await writeConfig({ appId, installationId });
        ctx.ui.notify("GitHub App configured successfully! Use /gh-bot on to enable.", "info");
      } catch (err) {
        ctx.ui.notify(`Failed to save config: ${err}`, "error");
      }
    },
  });

  // Restore state on session resume
  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const lastState = entries
      .filter((e) => e.type === "custom" && e.customType === "gh-bot")
      .pop();

    if (lastState?.data?.enabled) {
      try {
        botToken = await getInstallationToken();
        pi.setSystemPrompt("gh-bot", BOT_SYSTEM_PROMPT);
        ctx.ui.setStatus("gh-bot", "🤖 bot");
      } catch {
        // Silent fail on restore - user can re-enable manually
      }
    }
  });
}
