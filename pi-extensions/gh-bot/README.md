# gh-bot Extension

A pi extension that lets you run an AI agent as a GitHub App in your repo. Trigger it via workflow dispatch, and the agent responds—using the same skills and behavior as when you run pi locally.

## Assumptions

- **macOS** for local development (uses Keychain for secrets)
- **Single repo** where the GitHub App is installed
- **Personal use** — one human, one agent
- **Claude MAX** subscription for local use (OAuth)
- **Anthropic API key** for CI (pay-per-use)

## Quick Start

### 1. Create a GitHub App

Go to https://github.com/settings/apps and create an App with:
- Permissions: Issues (read/write), Pull requests (read/write), Contents (read/write)
- Install it on your target repo

### 2. Configure locally

```bash
pi -e ./pi-extensions/gh-bot
/gh-bot-setup
```

### 3. Add GitHub secrets

Add to your repo's Settings → Secrets and variables → Actions:

- **Secret**: `ANTHROPIC_API_KEY` — from https://console.anthropic.com
- **Secret**: `GH_BOT_PRIVATE_KEY` — your GitHub App's private key

### 4. Use it

Go to Actions → "Roger Roger" → Run workflow. Enter an issue or PR number and your prompt:

```
create a pr for this
review the pr
what do you think about this approach
```

## How It Works

1. You trigger the workflow with an issue/PR number and prompt
2. Workflow posts a comment recording your prompt (audit trail)
3. Workflow invokes pi with `respond to #N`
4. pi (with this extension) authenticates as the GitHub App
5. Agent reads the issue/PR and executes the prompt
6. Responses post as the GitHub App

Skills drive behavior. The extension only handles auth and confirmation bypass.

## Commands

| Command | Description |
|---------|-------------|
| `/gh-bot-setup` | Configure GitHub App credentials (stored in `~/.config/gh-bot/` + Keychain) |

## Behavioral Differences

| Aspect | Regular pi | pi + gh-bot |
|--------|------------|-------------|
| Identity | You (personal `gh` auth) | GitHub App |
| Confirmations | Required for push/comment/etc | Pre-approved, executes directly |

## Do Not Auto-load

This extension is designed for explicit CLI invocation only:

```bash
pi -e ./pi-extensions/gh-bot
```

**Do not** symlink it to `~/.pi/agent/extensions/`. It replaces the bash tool and injects a bot-mode system prompt—behavior you only want when acting as the GitHub App.
