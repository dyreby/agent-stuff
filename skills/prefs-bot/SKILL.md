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
- When replying to inline review comments, reference the addressing commit
