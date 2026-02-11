---
name: prefs-coding
description: Cross-cutting coding preferences. Use when working on any codebase.
---

## Design

- Prefer simple solutions with clearly defined responsibilities and boundaries
- Single responsibility and small surface area for modules, types, and functions
- Functional core, imperative shell: keep domain logic pure; push side effects to edges
- Don't add public API until a caller needs it

## Code Smells

Flag these proactively:

- Boundary inversion: core types in I/O layers, or lower layers depending on higher
- Invariant leaks: types claiming validity but exposing mutable fields or partial init
- Duplicate logic: same decision made in multiple places
- Overexposed API: public surface area beyond what callers need
- Mixed concerns: pure logic coupled to side effects
