# agent-stuff

Personal agent customizations for [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent): skills, prompts, themes, and extensions.

## Skills Taxonomy

Skills load on-demand based on task. Two types:

- **`prefs-*`**: Preferences. Constraints, standards, invariants. No execution logic.
- **`run-*`**: Procedures. Ordered steps. Reference `prefs-*` as needed.

**AGENTS.md** holds universals that apply to every interaction.

### Invariants

- Flat and composable, no inheritance
- Multiple `prefs-*` can load together; `run-*` loads what it needs
- Cross-cutting goes in broader skills (`prefs-coding`); domain-specific in narrower (`prefs-rust`)
- Load on-demand; minimize always-on context
