/**
 * GitHub Agent Extension
 *
 * Provides GitHub API tools for human-agent collaboration.
 * Agent can read issues/PRs, comment, and create PRs using a dedicated agent token.
 *
 * Setup:
 *   export GH_AGENT_TOKEN=ghp_xxx  # Personal access token for agent account
 *
 * Usage:
 *   pi -e ./pi-extensions/gh-agent.ts           # Default: local + GitHub tools
 *   pi -e ./pi-extensions/gh-agent.ts --gh-only # GitHub-only: no local filesystem
 *
 * Tools:
 *   gh_issue_list    - List open issues
 *   gh_issue_read    - Get issue details + comments
 *   gh_issue_comment - Post comment as agent
 *   gh_pr_list       - List open PRs
 *   gh_pr_read       - Get PR details
 *   gh_pr_diff       - Get PR diff
 *   gh_pr_create     - Create PR from branch (default mode only)
 *   gh_pr_comment    - Comment on PR as agent
 *   gh_file_read     - Fetch file from GitHub (--gh-only mode only)
 *
 * Invariants (structural, not policy):
 *   - Tools use only GH_AGENT_TOKEN, never user's auth
 *   - No tool accepts token as parameter
 *   - Can comment and create PRs, cannot merge/delete
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

// Tool input types
type IssueListInput = Static<typeof IssueListSchema>;
type IssueReadInput = Static<typeof IssueReadSchema>;
type IssueCommentInput = Static<typeof IssueCommentSchema>;
type PrListInput = Static<typeof PrListSchema>;
type PrReadInput = Static<typeof PrReadSchema>;
type PrDiffInput = Static<typeof PrDiffSchema>;
type PrCreateInput = Static<typeof PrCreateSchema>;
type PrCommentInput = Static<typeof PrCommentSchema>;
type FileReadInput = Static<typeof FileReadSchema>;

// Schemas
const IssueListSchema = Type.Object({
  repo: Type.String({ description: "Repository in owner/name format" }),
  state: Type.Optional(StringEnum(["open", "closed", "all"] as const)),
  limit: Type.Optional(Type.Number({ description: "Max issues to return (default 30)" })),
});

const IssueReadSchema = Type.Object({
  repo: Type.String({ description: "Repository in owner/name format" }),
  number: Type.Number({ description: "Issue number" }),
});

const IssueCommentSchema = Type.Object({
  repo: Type.String({ description: "Repository in owner/name format" }),
  number: Type.Number({ description: "Issue number" }),
  body: Type.String({ description: "Comment body (markdown)" }),
});

const PrListSchema = Type.Object({
  repo: Type.String({ description: "Repository in owner/name format" }),
  state: Type.Optional(StringEnum(["open", "closed", "merged", "all"] as const)),
  limit: Type.Optional(Type.Number({ description: "Max PRs to return (default 30)" })),
});

const PrReadSchema = Type.Object({
  repo: Type.String({ description: "Repository in owner/name format" }),
  number: Type.Number({ description: "PR number" }),
});

const PrDiffSchema = Type.Object({
  repo: Type.String({ description: "Repository in owner/name format" }),
  number: Type.Number({ description: "PR number" }),
});

const PrCreateSchema = Type.Object({
  repo: Type.String({ description: "Repository in owner/name format" }),
  title: Type.String({ description: "PR title" }),
  body: Type.String({ description: "PR body (markdown)" }),
  head: Type.String({ description: "Branch containing changes" }),
  base: Type.String({ description: "Branch to merge into (e.g., main)" }),
});

const PrCommentSchema = Type.Object({
  repo: Type.String({ description: "Repository in owner/name format" }),
  number: Type.Number({ description: "PR number" }),
  body: Type.String({ description: "Comment body (markdown)" }),
});

const FileReadSchema = Type.Object({
  repo: Type.String({ description: "Repository in owner/name format" }),
  path: Type.String({ description: "File path in repository" }),
  ref: Type.Optional(Type.String({ description: "Branch, tag, or commit (default: default branch)" })),
});

// Helper to run gh CLI with agent token
async function ghAgent(
  pi: ExtensionAPI,
  args: string[],
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string; code: number }> {
  const token = process.env.GH_AGENT_TOKEN;
  if (!token) {
    return {
      stdout: "",
      stderr: "GH_AGENT_TOKEN environment variable not set",
      code: 1,
    };
  }

  const result = await pi.exec("gh", args, {
    signal,
    env: { ...process.env, GH_TOKEN: token },
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code,
  };
}

// Parse repo string
function parseRepo(repo: string): { owner: string; name: string } | null {
  const parts = repo.split("/");
  if (parts.length !== 2) return null;
  return { owner: parts[0], name: parts[1] };
}

export default function ghAgentExtension(pi: ExtensionAPI) {
  // Register --gh-only flag
  pi.registerFlag("gh-only", {
    description: "Disable local tools, use GitHub API only",
    type: "boolean",
    default: false,
  });

  const ghOnly = pi.getFlag("--gh-only");

  // Apply tool restrictions on session start
  pi.on("session_start", async (_event, ctx) => {
    if (ghOnly) {
      // Get all GitHub tools we're registering
      const ghTools = [
        "gh_issue_list",
        "gh_issue_read",
        "gh_issue_comment",
        "gh_pr_list",
        "gh_pr_read",
        "gh_pr_diff",
        "gh_pr_comment",
        "gh_file_read",
      ];
      pi.setActiveTools(ghTools);
      ctx.ui.notify("GitHub-only mode: local tools disabled", "info");
    }
  });

  // --- Issue Tools ---

  pi.registerTool({
    name: "gh_issue_list",
    label: "List Issues",
    description: "List issues in a GitHub repository",
    parameters: IssueListSchema,
    async execute(_toolCallId, params: IssueListInput, signal) {
      const parsed = parseRepo(params.repo);
      if (!parsed) {
        return {
          content: [{ type: "text", text: "Invalid repo format. Use owner/name" }],
          isError: true,
        };
      }

      const args = [
        "issue",
        "list",
        "-R",
        params.repo,
        "--json",
        "number,title,state,author,createdAt,labels",
        "-L",
        String(params.limit ?? 30),
      ];
      if (params.state) args.push("-s", params.state);

      const result = await ghAgent(pi, args, signal);
      if (result.code !== 0) {
        return {
          content: [{ type: "text", text: `Error: ${result.stderr}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: result.stdout }],
        details: { repo: params.repo },
      };
    },
  });

  pi.registerTool({
    name: "gh_issue_read",
    label: "Read Issue",
    description: "Get issue details and comments",
    parameters: IssueReadSchema,
    async execute(_toolCallId, params: IssueReadInput, signal) {
      // Get issue details
      const issueArgs = [
        "issue",
        "view",
        String(params.number),
        "-R",
        params.repo,
        "--json",
        "number,title,state,body,author,createdAt,labels,assignees",
      ];
      const issueResult = await ghAgent(pi, issueArgs, signal);
      if (issueResult.code !== 0) {
        return {
          content: [{ type: "text", text: `Error: ${issueResult.stderr}` }],
          isError: true,
        };
      }

      // Get comments
      const commentsArgs = [
        "issue",
        "view",
        String(params.number),
        "-R",
        params.repo,
        "--json",
        "comments",
      ];
      const commentsResult = await ghAgent(pi, commentsArgs, signal);

      let output = `Issue #${params.number}:\n${issueResult.stdout}`;
      if (commentsResult.code === 0) {
        output += `\nComments:\n${commentsResult.stdout}`;
      }

      return {
        content: [{ type: "text", text: output }],
        details: { repo: params.repo, number: params.number },
      };
    },
  });

  pi.registerTool({
    name: "gh_issue_comment",
    label: "Comment on Issue",
    description: "Post a comment on an issue as the agent",
    parameters: IssueCommentSchema,
    async execute(_toolCallId, params: IssueCommentInput, signal) {
      const args = [
        "issue",
        "comment",
        String(params.number),
        "-R",
        params.repo,
        "-b",
        params.body,
      ];

      const result = await ghAgent(pi, args, signal);
      if (result.code !== 0) {
        return {
          content: [{ type: "text", text: `Error: ${result.stderr}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Comment posted on issue #${params.number}` }],
        details: { repo: params.repo, number: params.number },
      };
    },
  });

  // --- PR Tools ---

  pi.registerTool({
    name: "gh_pr_list",
    label: "List PRs",
    description: "List pull requests in a GitHub repository",
    parameters: PrListSchema,
    async execute(_toolCallId, params: PrListInput, signal) {
      const args = [
        "pr",
        "list",
        "-R",
        params.repo,
        "--json",
        "number,title,state,author,createdAt,headRefName,baseRefName",
        "-L",
        String(params.limit ?? 30),
      ];
      if (params.state) args.push("-s", params.state);

      const result = await ghAgent(pi, args, signal);
      if (result.code !== 0) {
        return {
          content: [{ type: "text", text: `Error: ${result.stderr}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: result.stdout }],
        details: { repo: params.repo },
      };
    },
  });

  pi.registerTool({
    name: "gh_pr_read",
    label: "Read PR",
    description: "Get pull request details",
    parameters: PrReadSchema,
    async execute(_toolCallId, params: PrReadInput, signal) {
      const args = [
        "pr",
        "view",
        String(params.number),
        "-R",
        params.repo,
        "--json",
        "number,title,state,body,author,createdAt,headRefName,baseRefName,additions,deletions,files,reviews,comments",
      ];

      const result = await ghAgent(pi, args, signal);
      if (result.code !== 0) {
        return {
          content: [{ type: "text", text: `Error: ${result.stderr}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: result.stdout }],
        details: { repo: params.repo, number: params.number },
      };
    },
  });

  pi.registerTool({
    name: "gh_pr_diff",
    label: "Get PR Diff",
    description: "Get the diff for a pull request",
    parameters: PrDiffSchema,
    async execute(_toolCallId, params: PrDiffInput, signal) {
      const args = ["pr", "diff", String(params.number), "-R", params.repo];

      const result = await ghAgent(pi, args, signal);
      if (result.code !== 0) {
        return {
          content: [{ type: "text", text: `Error: ${result.stderr}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: result.stdout }],
        details: { repo: params.repo, number: params.number },
      };
    },
  });

  // gh_pr_create - only in default mode (needs local git)
  if (!ghOnly) {
    pi.registerTool({
      name: "gh_pr_create",
      label: "Create PR",
      description: "Create a pull request from a branch",
      parameters: PrCreateSchema,
      async execute(_toolCallId, params: PrCreateInput, signal) {
        const args = [
          "pr",
          "create",
          "-R",
          params.repo,
          "-t",
          params.title,
          "-b",
          params.body,
          "-H",
          params.head,
          "-B",
          params.base,
        ];

        const result = await ghAgent(pi, args, signal);
        if (result.code !== 0) {
          return {
            content: [{ type: "text", text: `Error: ${result.stderr}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `PR created: ${result.stdout}` }],
          details: { repo: params.repo, head: params.head, base: params.base },
        };
      },
    });
  }

  pi.registerTool({
    name: "gh_pr_comment",
    label: "Comment on PR",
    description: "Post a comment on a pull request as the agent",
    parameters: PrCommentSchema,
    async execute(_toolCallId, params: PrCommentInput, signal) {
      const args = [
        "pr",
        "comment",
        String(params.number),
        "-R",
        params.repo,
        "-b",
        params.body,
      ];

      const result = await ghAgent(pi, args, signal);
      if (result.code !== 0) {
        return {
          content: [{ type: "text", text: `Error: ${result.stderr}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Comment posted on PR #${params.number}` }],
        details: { repo: params.repo, number: params.number },
      };
    },
  });

  // --- File Read (gh-only mode) ---

  if (ghOnly) {
    pi.registerTool({
      name: "gh_file_read",
      label: "Read File from GitHub",
      description: "Fetch file content from GitHub (not local filesystem)",
      parameters: FileReadSchema,
      async execute(_toolCallId, params: FileReadInput, signal) {
        const args = [
          "api",
          `/repos/${params.repo}/contents/${params.path}`,
          "--jq",
          ".content",
        ];
        if (params.ref) {
          args.push("-f", `ref=${params.ref}`);
        }

        const result = await ghAgent(pi, args, signal);
        if (result.code !== 0) {
          return {
            content: [{ type: "text", text: `Error: ${result.stderr}` }],
            isError: true,
          };
        }

        // Decode base64 content
        const decoded = Buffer.from(result.stdout.trim(), "base64").toString("utf-8");

        return {
          content: [{ type: "text", text: decoded }],
          details: { repo: params.repo, path: params.path, ref: params.ref },
        };
      },
    });
  }
}
