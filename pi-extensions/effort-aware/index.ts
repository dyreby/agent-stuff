/**
 * Effort-Aware Model Selection Extension
 *
 * Reads `min-effort` from run-* skill frontmatter and adjusts model/thinking
 * level accordingly. Supports both explicit `/skill:` invocations and
 * auto-loaded skills (detected via file reads).
 *
 * min-effort levels:
 *   0 = procedural, no judgment   → sonnet, thinking off
 *   1 = light judgment            → sonnet, thinking low
 *   2 = significant analysis      → opus, thinking minimal
 *   3 = complex reasoning         → opus, thinking medium
 *
 * The mapping from effort levels to models lives here, so when models change
 * we update one place.
 */

import * as fs from "node:fs/promises";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface EffortMapping {
  provider: string;
  modelSubstring: string;
  thinking: ThinkingLevel;
}

const EFFORT_MAP: Record<number, EffortMapping> = {
  0: { provider: "anthropic", modelSubstring: "sonnet", thinking: "off" },
  1: { provider: "anthropic", modelSubstring: "sonnet", thinking: "low" },
  2: { provider: "anthropic", modelSubstring: "opus", thinking: "minimal" },
  3: { provider: "anthropic", modelSubstring: "opus", thinking: "medium" },
};

const MAX_EFFORT = 3;

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const sep = line.indexOf(":");
    if (sep > 0) {
      result[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
    }
  }
  return result;
}

function getMinEffort(content: string): number | null {
  const fm = parseFrontmatter(content);
  if (fm["min-effort"] == null) return null;
  const n = parseInt(fm["min-effort"], 10);
  if (isNaN(n) || n < 0 || n > MAX_EFFORT) return null;
  return n;
}

export default function skillModelExtension(pi: ExtensionAPI) {
  let maxEffort = -1; // -1 = no run-* skill loaded yet
  let applied = false;

  async function applyEffort(effort: number, ctx: { ui: { notify: (msg: string, level: string) => void }; modelRegistry: { find: (provider: string, substring: string) => unknown } }) {
    const mapping = EFFORT_MAP[effort];
    if (!mapping) return;

    // Find and set model
    const model = ctx.modelRegistry.find(mapping.provider, mapping.modelSubstring);
    if (model) {
      await pi.setModel(model);
    }

    pi.setThinkingLevel(mapping.thinking);
    ctx.ui.notify(
      `effort-aware: level ${effort} → ${mapping.modelSubstring}, thinking ${mapping.thinking}`,
      "info"
    );
    applied = true;
  }

  // Detect /skill:run-* commands and read their frontmatter
  pi.on("input", async (event) => {
    const matches = event.text.matchAll(/\/skill:([a-z0-9-]+)/g);
    const commands = pi.getCommands();

    for (const match of matches) {
      const skillName = match[1];
      if (!skillName.startsWith("run-")) continue;

      // Find the skill's actual path via pi.getCommands()
      const skillCmd = commands.find(
        (cmd) => cmd.source === "skill" && cmd.name === `skill:${skillName}`
      );
      if (!skillCmd?.path) continue;

      try {
        const content = await fs.readFile(skillCmd.path, "utf-8");
        const effort = getMinEffort(content);
        if (effort != null && effort > maxEffort) {
          maxEffort = effort;
        }
      } catch {
        // Skill file not found, ignore
      }
    }
    return { action: "continue" as const };
  });

  // Detect auto-loaded skills via file reads of .../run-*/SKILL.md
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "Read") return;
    const input = event.input as { path?: string };
    if (!input.path) return;

    // Match any path ending with /run-*/SKILL.md (handles both system and local skills)
    const match = input.path.match(/\/(run-[a-z0-9-]+)\/SKILL\.md$/);
    if (!match) return;

    try {
      const content = await fs.readFile(input.path, "utf-8");
      const effort = getMinEffort(content);
      if (effort != null && effort > maxEffort) {
        maxEffort = effort;
        // Apply immediately since we're mid-agent
        await applyEffort(maxEffort, ctx);
      }
    } catch {
      // Ignore read errors
    }
  });

  // Apply effort level before agent starts (for /skill: invocations)
  pi.on("before_agent_start", async (_event, ctx) => {
    if (maxEffort >= 0 && !applied) {
      await applyEffort(maxEffort, ctx);
    }
  });

  // Reset per-prompt state
  pi.on("agent_end", async () => {
    maxEffort = -1;
    applied = false;
  });
}
