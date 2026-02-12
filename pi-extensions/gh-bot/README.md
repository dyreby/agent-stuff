# gh-bot Extension

GitHub App authentication for pi bot mode. When loaded, all `gh` CLI commands authenticate as the GitHub App instead of your personal account.

## Design

This extension enables a webhook-driven workflow:

1. **You** comment on an issue/PR with `@<agent> <prompt>`
2. **GitHub Action** extracts the prompt and invokes pi with this extension
3. **pi** executes the prompt, posting responses as the GitHub App
4. **You** review the bot's work and iterate

The prompt is identical to what you'd type in pi locally. Skills drive behavior—the extension only handles auth and confirmation bypass.

## Invocation

**Not auto-loaded.** Invoke explicitly via path:

```bash
# Local testing
pi -e ./pi-extensions/gh-bot

# CI (print mode)
pi -e ./pi-extensions/gh-bot -p "issue #12: create a pr for this"
```

To exclude from auto-load if symlinked to `~/.pi/agent/extensions/`:

```json
// ~/.pi/agent/settings.json
{
  "extensions": ["-extensions/gh-bot"]
}
```

## Credentials

Reads from environment variables (CI) or local config (macOS):

| Source | Location |
|--------|----------|
| Environment | `GH_BOT_APP_ID`, `GH_BOT_INSTALLATION_ID`, `GH_BOT_PRIVATE_KEY` |
| Local config | `~/.config/gh-bot/config.json` + macOS Keychain |

Environment variables take precedence.

### Setup

Run `/gh-bot-setup` in pi to configure:

| Field | Storage | Description |
|-------|---------|-------------|
| `appId` | config.json | GitHub App ID |
| `installationId` | config.json | Installation ID for the target repo |
| `human` | config.json | Your GitHub login (who can invoke the bot) |
| `agent` | config.json | GitHub App name (the bot identity) |
| `repo` | config.json | Target repo (`owner/repo`) |
| Private key | Keychain | GitHub App PEM key (base64-encoded in Keychain) |

### Sync to GitHub

Run `/gh-bot-sync` to push local config to GitHub:

| Type | Name | Source |
|------|------|--------|
| Variable | `GH_BOT_APP_ID` | config.json |
| Variable | `GH_BOT_INSTALLATION_ID` | config.json |
| Variable | `GH_BOT_HUMAN` | config.json |
| Variable | `GH_BOT_AGENT` | config.json |
| Secret | `GH_BOT_PRIVATE_KEY` | Keychain |
| Secret | `ANTHROPIC_REFRESH_TOKEN` | `~/.pi/agent/auth.json` |

The LLM never sees secret values—sync is a direct command that reads local files and pipes to `gh`.

## Directive Pattern

Mention `@<agent>` (the GitHub App name) followed by a prompt:

```
@<agent> create a pr for this
@<agent> review the pr
@<agent> what do you think about this approach
```

The text after `@<agent>` becomes the pi prompt.

## Prompt Format

GitHub Actions pass minimal context—the agent reads the issue/PR to find the directive:

| Event | Prompt |
|-------|--------|
| Issue comment | `respond to issue #N` |
| PR comment | `respond to pr #N` |
| PR review | `respond to pr #N` |

The agent reads the issue/PR, finds the `@<agent>` mention, and executes the text following it as the prompt.

## Behavioral Differences

| Aspect | Regular pi | pi + gh-bot |
|--------|------------|-------------|
| Identity | You (personal `gh` auth) | GitHub App |
| Confirmations | Required for push/comment/etc | Pre-approved, executes directly |

## Guardrails

- Only comments from `<human>` can invoke the bot (filtered in GH Action)
- Bot's own comments don't trigger workflows (`<agent>` ≠ `<human>`)
