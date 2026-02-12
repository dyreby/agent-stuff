---
name: run-pr-review
description: Review PRs or respond to PR review comments.
min-effort: 2
---

Assumes skill: prefs-coding, prefs-code-review, prefs-git

## Preconditions

- Load applicable prefs-* skills for the codebase (e.g., prefs-rust)

## Procedure

1. If PR not specified, ask which PR
2. Determine role: **reviewer** or **author** responding to feedback

### Reviewer

1. Gather context: diff, description, linked issues, prior review state
2. Analyze: apply rubric from prefs-code-review
3. Propose action: summarize findings and recommend next steps
   - Scale detail to PR complexity and linked issues
   - For bot-authored PRs: leave review as comment, request user review

### Author (responding to feedback)

1. Ask: address all comments or specific ones?
2. Read review threads and identify actionable items
3. Check branch state: ensure on correct branch, pull latest
4. Make changes — batch simple fixes, go comment-by-comment when tradeoffs need user input
5. Iterate with user to match expectations
6. Commit and push (with confirmation per prefs-git)
7. Reply to comments, referencing the addressing commit
8. When all comments addressed: re-request review if needed
