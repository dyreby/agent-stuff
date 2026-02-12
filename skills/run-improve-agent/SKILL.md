---
name: run-improve-agent
description: Evolve agent guidance artifacts. Use when adding, refining, or fixing skills, AGENTS.md, or extensions.
min-effort: 2
---

Assumes skill: prefs-agent

## Aim

- Align agent behavior with user expectations
- Use minimum context needed to achieve that alignment

## Context

Agent files live in `~/repos/dyreby/agent-stuff`.

## Preconditions

- Verify repo is clean before editing

## Procedure

1. If loaded mid-session: ask what behavior was incorrect; gather context only if directed
2. Clarify intent: what should change and why
3. Classify: what type of content (per prefs-agent taxonomy)
4. Locate: which artifact should change, or create new
5. Review: read existing artifacts to understand context
6. Propose: minimal change, explain placement
7. Apply: make the change

## Applying changes

- Never commit directly to main
- Create a PR for fixes and improvements
- Create an issue for quick captures or larger proposals

## Guidelines

- Evaluate options against the Aim above; prefer wording that better aligns agent behavior with user expectations
- Prefer durable improvements over one-off fixes
- Prefer small, local edits; keep rules composable
- Make scope explicit; justify placement
- Disambiguate before editing if wording could span multiple scopes
- Avoid duplication across skills
