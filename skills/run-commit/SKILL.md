---
name: run-commit
description: Create a git commit for current changes.
---

Assumes skill: prefs-git

## Preconditions

- Staged changes exist

## Procedure

1. Review staged changes:
   - `git diff --cached --stat` (overview)
   - `git diff --cached` (details)
2. Generate commit message following prefs-git
3. If conventions unclear, check `git log -n 10 --pretty=format:"- %s"` or project docs
4. If ambiguous, present 2-3 options for user to choose
5. `git commit -m "message"`
