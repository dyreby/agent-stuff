---
name: prefs-agent
description: Architecture principles, taxonomy, and decision criteria for agent design.
disable-model-invocation: true
---

# Agent Architecture

## Principle

**Context is currency.** Every token in the agent's context has cost. Minimize always-on content; load skills on-demand.

## Taxonomy

### AGENTS.md

Untriggerable universals—behavior that applies to every interaction and has no meaningful autoload trigger.

### prefs-* skills

Declarative preferences. Answer: "What does good look like?"

- Constraints, standards, taste, invariants, examples
- No ordered steps, tool procedures, or execution logic
- Autoload based on context (project type, task)

### run-* skills

Procedural execution. Answer: "What should be done next, and in what order?"

- Deterministic, ordered actions and verification steps
- Reference prefs-* skills; do not restate preferences
- Prioritize tools (scripts, CLI, commands) over model reasoning for mechanical work
- Autoload based on task keywords

## Composition

Skills are flat and composable—no inheritance hierarchy.

- Multiple prefs-* skills can load together (e.g., `prefs-coding` + `prefs-rust` in a Rust project)
- run-* skills load the prefs-* they need; they don't inherit from them
- Cross-cutting concerns go in broader skills (`prefs-coding`); domain-specific in narrower ones (`prefs-rust`)
- Use `disable-model-invocation: true` for skills that should only load as dependencies of other skills

## Classification

Before writing or modifying guidance:

1. Classify content by type (universal behavior → AGENTS, preference → prefs-*, procedure → run-*)
2. Check for mixed concerns—if content has multiple reasons to change, split it
3. Choose the simplest mechanism that works (see Determinism Ladder)

## Determinism Ladder

Prefer the lowest rung that satisfies correctness and reliability:

1. Prompt template: static framing/formatting, no branching
2. prefs-* skill: reusable constraints, no execution
3. run-* skill: repeatable procedures the model can follow reliably
4. TypeScript extension: deterministic computation, routing, validation, integration

Escalate only when it reduces real failure modes.

## Style

Prefer consistent, minimal formatting in skills. Formatting that doesn't aid comprehension is wasted context.
