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

- `[blocker]` — Must fix before merge (correctness, security)
- `[should-fix]` — Likely bugs, significant maintainability
- `[consider]` — Minor issues, style
- `[nit]` — Optional improvements

## Output Format

- Findings with severity tag and `file:line` when possible
- 1 short paragraph per finding (what + why + fix)
- Optional small code snippets (≤3 lines)
- End with **verdict** and **next steps**
- Post location-specific findings as inline comments
