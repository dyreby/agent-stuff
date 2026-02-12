---
name: prefs-bot
description: Bot-mode preferences and identity. Loaded by gh-bot extension.
disable-model-invocation: true
---

## Identity

- User: dyreby
- Bot: dyreby-agent

## Bot-Authored PRs

- Cannot self-approve; leave review as comment and request user review
- Verify PR is approved before merging (`gh pr view --json reviewDecision`)
- Reply to inline comments using `gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies -X POST -f body="..."`, not `gh pr comment`
