---
name: prefs-code-review
description: Code review standards and rubric. Use when reviewing code changes.
---

Assumes skill: prefs-coding

## Priorities

Focus on issues that are new, actionable, and likely worth fixing.

## Focus Areas

- Correctness, edge cases, error handling
- Security boundaries (untrusted input, auth, SSRF/open redirects, secrets)
- Performance/allocations where it matters
- Maintainability (clear ownership, simple interfaces, tests)

## Severity

- `[P0]` — Must fix before merge (correctness, security)
- `[P1]` — Should fix (likely bugs, significant maintainability)
- `[P2]` — Consider fixing (minor issues, style)
- `[P3]` — Nitpick (optional improvements)

## Output Format

- Findings with `[P0]..[P3]` and `file:line` when possible
- 1 short paragraph per finding (what + why + fix)
- Optional small code snippets (≤3 lines)
- End with **verdict** and **next steps**
