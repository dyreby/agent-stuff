---
name: prefs-rust
description: Rust-specific preferences. Use when working in a Rust codebase.
---

Assumes skill: prefs-coding

## Style

- Code must pass `cargo clippy --all-targets --all-features -- -D warnings -W clippy::pedantic`
- Prefer merged imports
- Doc comment bullet lists: periods for full sentences, omit for fragments, be consistent within a list
