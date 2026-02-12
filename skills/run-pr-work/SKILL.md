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
- "I responded to the review" / "I left comments on the PR"

## Procedure

1. Read PR context: description, comments, review threads, diff
2. Identify what's requested: extract actionable items from feedback
3. Check branch state: ensure on correct branch, pull latest if needed
4. Make changes: implement requested fixes
5. Iterate with user to match expectations
6. Commit and push (with confirmation per prefs-git)
7. Reply to review feedback: acknowledge review-level comments and reply to inline comments, referencing the addressing commit
8. When all comments addressed: request user review again
