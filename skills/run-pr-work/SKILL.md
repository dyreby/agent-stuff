---
name: run-pr-work
description: Procedure for addressing PR tasks. Use when responding to PR comments, CI failures, or update requests.
---

Assumes skill: prefs-git

## Goal

Procedure for responding to PR feedback or fixing PR issues.

## Triggers

- "Address the comment in PR #X"
- "Fix CI on #X"
- "Update PR #X with..."

## Procedure

1. Read PR context: description, comments, review threads, diff
2. Identify what's requested: extract actionable items from feedback
3. Check branch state: ensure on correct branch, pull latest if needed
4. Make changes: implement requested fixes
5. Iterate with user to match expectations
6. Commit and push (with confirmation per prefs-git)
