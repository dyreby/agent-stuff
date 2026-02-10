---
name: run-improve-agent
description: Evolve agent guidance artifacts. Use when adding, refining, or fixing skills, AGENTS.md, or extensions.
---

# Improve Agent

## Aim

- Align agent behavior with user expectations
- Use minimum context needed to achieve that alignment

## Context

Agent files live in `~/repos/dyreby/agent-stuff`.

## Preconditions

- Read `prefs-agent` for architecture principles and taxonomy
- Verify repo is clean before editing

## Procedure

1. Clarify intent: what should change and why
2. Classify: what type of content (per prefs-agent taxonomy)
3. Locate: which artifact should change, or create new
4. Review: read existing artifacts to understand context
5. Propose: minimal change, explain placement
6. Apply: make the change

## Guidelines

- Evaluate options against the Aim above; prefer wording that better aligns agent behavior with user expectations
- Prefer durable improvements over one-off fixes
- Prefer small, local edits; keep rules composable
- Make scope explicit; justify placement
- Disambiguate before editing if wording could span multiple scopes
- Avoid duplication across skills
