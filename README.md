# agent-stuff

This repo is where I iterate with my agent toward alignment.

The skills that guide the agent live here. When the agent does something unexpected, I refine them the boring way: issues and PRs. Over time, its responses should converge with my priorities, judgment, and standards.

The end goal: agent behavior aligned with my expectations, captured in skills.

## Principles

- **Same prompt, same behavior.** Prompting `pi` locally or through the bot uses the same skills and context.
- **Skills evolve through use.** Simple prompts reveal what's missing or needs updating. The bot and I test them together.
- **Human in the loop.** I review the agent's work, correct course, and have final review on all PRs.

## How

I invoke the agent manually via GitHub Actions → "Roger Roger" workflow dispatch. I enter an issue or PR number and a prompt. The workflow posts a comment recording the prompt, then invokes `pi` with the issue or PR number. The agent reads the thread and executes the prompt—posting responses as the bot.

Example prompts:
```
plan how to resolve this
create a pr for this
review the pr
address the feedback
```

Others can comment and review code. Those become context the agent sees when I trigger it.

## Skills

Skills load on-demand based on task. Two types:

- **`prefs-*`**: Preferences. Constraints, standards, invariants. No execution logic.
- **`run-*`**: Procedures. Ordered steps. Reference `prefs-*` as needed.

**AGENTS.md** holds universals that apply to every interaction.

### Invariants

- Flat and composable, no inheritance
- Multiple `prefs-*` can load together; `run-*` loads what it needs
- Cross-cutting goes in broader skills (`prefs-coding`); domain-specific in narrower (`prefs-rust`)
- Load on-demand; minimize always-on context
