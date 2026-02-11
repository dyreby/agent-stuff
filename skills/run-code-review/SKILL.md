---
name: run-code-review
description: Procedure for reviewing code changes.
---

Assumes skill: prefs-code-review

## Goal

General-purpose code review procedure that works across contexts: PRs, staged commits, local diffs.

## Preconditions

- Load applicable prefs-* skills for the codebase (e.g., prefs-rust)

## Procedure

1. Gather context: diff, relevant metadata, and any prior review state
   - If diff base is ambiguous (chained PRs, unclear upstream), clarify before loading diff
2. Analyze: apply rubric
3. Propose action: summarize findings and recommend next steps based on context
