---
name: run-code-review
description: Procedure for reviewing code changes.
min-effort: 1
---

Assumes skill: prefs-code-review, prefs-git

## Goal

General-purpose code review procedure that works across contexts: PRs, staged commits, local diffs.

## Preconditions

- Load applicable prefs-* skills for the codebase (e.g., prefs-rust)

## Procedure

1. Gather context: diff, relevant metadata, and any prior review state
   - If diff base is ambiguous (chained PRs, unclear upstream), clarify before loading diff
   - Check linked issues for additional context
2. Analyze: apply rubric
3. Propose action: summarize findings and recommend next steps
   - Scale detail to PR complexity and linked issues
   - For bot-authored PRs: leave review as comment, request user review
4. Handle response: when user indicates they responded to review request, load run-pr-work
