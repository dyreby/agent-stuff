---
name: prefs-git
description: Git preferences including commit message format. Use when working with git or GitHub.
---

## Branching

- Never commit directly to main; create a feature branch first
- Branch naming: descriptive kebab-case (e.g., `fix-pr-create-tool`)
- Exception: only commit to main if user explicitly requests it
- Branch deletion: include both local and remote when asked to remove branches; confirm before deleting (hard to revert, especially remote)

## Commit Messages

- Imperative mood ("Add feature" not "Added feature")
- Subject line ≤72 chars, no trailing period
- Body optional—if needed, blank line after subject
- No sign-offs or footers

## Pull Requests

- When discussing a PR or issue, check for associated PRs and issues and read relevant diffs first
- Verify claims against the diff; comments may be stale from development history
- Use professional tone; avoid casual shorthand (LGTM) and emoji
- Reply to inline PR comments using `gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies -X POST -f body="..."`, not `gh pr comment`
- Include commit link when replying with a fix
- After addressing review comments, re-request reviewer's review (`gh pr edit --add-reviewer`)

## Assumes skill

- run-improve-agent: when reviewing repos with agent guidance artifacts (skills/, AGENTS.md)

## Confirmation Required

Show the literal command and confirm before externally-visible or hard-to-revert actions.

CLI:
- git push (especially --force)
- gh repo edit (enables features, changes settings)
- gh issue create, gh issue comment, gh issue close
- gh pr create, gh pr merge, gh pr close, gh pr comment, gh pr review
- gh api with mutations (POST, PUT, DELETE, PATCH, GraphQL mutations)

gh-agent tools:
- gh_issue_create, gh_issue_comment
- gh_pr_create, gh_pr_comment, gh_pr_review, gh_pr_request_review

