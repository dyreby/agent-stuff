---
name: prefs-git
description: Git preferences including commit message format. Use when working with git.
---

## Commit Messages

- Imperative mood ("Add feature" not "Added feature")
- Subject line ≤72 chars, no trailing period
- Body optional—if needed, blank line after subject
- No sign-offs or footers

## PR Reviews

- Verify claims against the diff; comments may be stale from development history
- Use professional tone; avoid casual shorthand (LGTM) and emoji

## Confirmation Required

Show command/content and confirm before:
- git push
- gh pr create, gh pr merge, gh pr close, gh pr review
- gh pr comment, gh issue comment
- gh issue close
