# effort-aware

Adjusts model and thinking level based on `min-effort` in run-* skill frontmatter.

## Usage

```bash
pi -e ./pi-extensions/effort-aware
```

## Effort Levels

| Level | Meaning | Model | Thinking |
|-------|---------|-------|----------|
| 0 | Procedural, no judgment | sonnet | off |
| 1 | Light judgment | sonnet | low |
| 2 | Significant analysis | opus | minimal |
| 3 | Complex reasoning | opus | medium |

## Skill Frontmatter

Add `min-effort` to any run-* skill:

```yaml
---
name: run-code-review
description: Procedure for reviewing code changes.
min-effort: 1
---
```

Skills without `min-effort` (including all prefs-* skills) don't trigger model changes.

## Behavior

- Detects skills via `/skill:run-*` commands and file reads (auto-loading)
- When multiple run-* skills load, uses the maximum effort level
- Resets after each agent prompt
- No frontmatter → session defaults preserved
