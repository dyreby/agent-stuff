---
name: prefs-git
description: Git preferences including commit message format. Use when working with git or GitHub.
---

## Branching

- Never commit directly to main; create a feature branch first
- Branch naming: descriptive kebab-case (e.g., `fix-pr-create-tool`)
- Exception: only commit to main if user explicitly requests it

## Commit Messages

- Imperative mood ("Add feature" not "Added feature")
- Subject line ≤72 chars, no trailing period
- Body optional—if needed, blank line after subject
- No sign-offs or footers

## PR Reviews

- Verify claims against the diff; comments may be stale from development history
- Use professional tone; avoid casual shorthand (LGTM) and emoji

## Confirmation Required

Show command/content and confirm before externally-visible actions:

CLI:
- git push
- gh issue create, gh issue comment, gh issue close
- gh pr create, gh pr merge, gh pr close, gh pr comment, gh pr review

gh-agent tools:
- gh_issue_create, gh_issue_comment
- gh_pr_create, gh_pr_comment, gh_pr_review, gh_pr_request_review
