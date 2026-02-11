/**
 * GitHub Agent Extension
 *
 * An agent that only sees the world through GitHub.
 *
 * When you activate this extension, you're talking to an agent whose entire
 * view of the world is GitHub: issues, PRs, comments, and code. It can read
 * and respond to conversations, review diffs, and create PRs — but only
 * through the GitHub API.
 *
 * By default, the agent uses your `gh` CLI credentials (from `gh auth login`).
 * Set GH_AGENT_TOKEN to use a different GitHub account instead.
 *
 * Usage:
 *   pi -e ./pi-extensions/gh-agent.ts           # Default: local + GitHub tools
 *   pi -e ./pi-extensions/gh-agent.ts --gh-only # GitHub-only: no local filesystem
 *
 * Tools:
 *   gh_issue_list    - List issues
 *   gh_issue_read    - Get issue details + comments
 *   gh_issue_comment - Post comment on issue
 *   gh_pr_list       - List pull requests
 *   gh_pr_read       - Get PR details
 *   gh_pr_diff       - Get PR diff
 *   gh_pr_create     - Create PR from branch (default mode only)
 *   gh_pr_comment    - Post comment on PR
 *   gh_file_read     - Fetch file from GitHub (--gh-only mode only)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

// --- Schemas ---

const RepoParam = Type.String({ description: "Repository in owner/name format" });
const IssueNumber = Type.Number({ description: "Issue number" });
const PrNumber = Type.Number({ description: "PR number" });
const CommentBody = Type.String({ description: "Comment body (markdown)" });

const IssueListSchema = Type.Object({
  repo: RepoParam,
  state: Type.Optional(StringEnum(["open", "closed", "all"] as const)),
  limit: Type.Optional(Type.Number({ description: "Max issues to return (default 30)" })),
});

const IssueReadSchema = Type.Object({
  repo: RepoParam,
  number: IssueNumber,
});

const IssueCommentSchema = Type.Object({
  repo: RepoParam,
  number: IssueNumber,
  body: CommentBody,
});

const PrListSchema = Type.Object({
  repo: RepoParam,
  state: Type.Optional(StringEnum(["open", "closed", "merged", "all"] as const)),
  limit: Type.Optional(Type.Number({ description: "Max PRs to return (default 30)" })),
});

const PrReadSchema = Type.Object({
  repo: RepoParam,
  number: PrNumber,
});

const PrDiffSchema = Type.Object({
  repo: RepoParam,
  number: PrNumber,
});

const PrCreateSchema = Type.Object({
  repo: RepoParam,
  title: Type.String({ description: "PR title" }),
  body: Type.String({ description: "PR body (markdown)" }),
  head: Type.String({ description: "Branch containing changes" }),
  base: Type.String({ description: "Branch to merge into (e.g., main)" }),
});

const PrCommentSchema = Type.Object({
  repo: RepoParam,
  number: PrNumber,
  body: CommentBody,
});

const FileReadSchema = Type.Object({
  repo: RepoParam,
  path: Type.String({ description: "File path in repository" }),
  ref: Type.Optional(Type.String({ description: "Branch, tag, or commit (default: default branch)" })),
});

// --- Exported Types (for typed tool_call interception) ---

export type IssueListInput = Static<typeof IssueListSchema>;
export type IssueReadInput = Static<typeof IssueReadSchema>;
export type IssueCommentInput = Static<typeof IssueCommentSchema>;
export type PrListInput = Static<typeof PrListSchema>;
export type PrReadInput = Static<typeof PrReadSchema>;
export type PrDiffInput = Static<typeof PrDiffSchema>;
export type PrCreateInput = Static<typeof PrCreateSchema>;
export type PrCommentInput = Static<typeof PrCommentSchema>;
export type FileReadInput = Static<typeof FileReadSchema>;

// --- Helpers ---

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  details?: Record<string, unknown>;
};

type ExecResult = { stdout: string; stderr: string; code: number };

function ghResult(result: ExecResult, details?: Record<string, unknown>): ToolResult {
  if (result.code !== 0) {
    return { content: [{ type: "text", text: `Error: ${result.stderr}` }], isError: true };
  }
  return { content: [{ type: "text", text: result.stdout }], details };
}

function ghResultText(result: ExecResult, text: string, details?: Record<string, unknown>): ToolResult {
  if (result.code !== 0) {
    return { content: [{ type: "text", text: `Error: ${result.stderr}` }], isError: true };
  }
  return { content: [{ type: "text", text }], details };
}

// Cached token (resolved once per session)
let cachedToken: string | null = null;

async function getToken(pi: ExtensionAPI): Promise<string | null> {
  if (cachedToken) return cachedToken;

  // Explicit token takes precedence (for using a different account)
  if (process.env.GH_AGENT_TOKEN) {
    cachedToken = process.env.GH_AGENT_TOKEN;
    return cachedToken;
  }

  // Fall back to gh CLI's stored credentials
  const result = await pi.exec("gh", ["auth", "token"]);
  if (result.code === 0 && result.stdout.trim()) {
    cachedToken = result.stdout.trim();
    return cachedToken;
  }

  return null;
}

async function gh(
  pi: ExtensionAPI,
  args: string[],
  signal?: AbortSignal
): Promise<ExecResult> {
  const token = await getToken(pi);
  if (!token) {
    return {
      stdout: "",
      stderr: "No GitHub credentials found. Run `gh auth login` or set GH_AGENT_TOKEN.",
      code: 1,
    };
  }

  return pi.exec("gh", args, {
    signal,
    env: { ...process.env, GH_TOKEN: token },
  });
}

// --- Extension ---

export default function ghAgentExtension(pi: ExtensionAPI) {
  pi.registerFlag("gh-only", {
    description: "Disable local tools, use GitHub API only",
    type: "boolean",
    default: false,
  });

  pi.on("session_start", async (_event, ctx) => {
    if (pi.getFlag("gh-only")) {
      pi.setActiveTools([
        "gh_issue_list", "gh_issue_read", "gh_issue_comment",
        "gh_pr_list", "gh_pr_read", "gh_pr_diff", "gh_pr_comment",
        "gh_file_read",
      ]);
      ctx.ui.notify("GitHub-only mode: local tools disabled", "info");
    }
  });

  // --- Issue Tools ---

  pi.registerTool({
    name: "gh_issue_list",
    label: "List Issues",
    description: "List issues in a GitHub repository",
    parameters: IssueListSchema,
    async execute(_id, params: IssueListInput, signal) {
      const args = [
        "issue", "list", "-R", params.repo,
        "--json", "number,title,state,author,createdAt,labels",
        "-L", String(params.limit ?? 30),
      ];
      if (params.state) args.push("-s", params.state);

      return ghResult(await gh(pi, args, signal), { repo: params.repo });
    },
  });

  pi.registerTool({
    name: "gh_issue_read",
    label: "Read Issue",
    description: "Get issue details and comments",
    parameters: IssueReadSchema,
    async execute(_id, params: IssueReadInput, signal) {
      const result = await gh(pi, [
        "issue", "view", String(params.number), "-R", params.repo,
        "--json", "number,title,state,body,author,createdAt,labels,assignees,comments",
      ], signal);

      return ghResult(result, { repo: params.repo, number: params.number });
    },
  });

  pi.registerTool({
    name: "gh_issue_comment",
    label: "Comment on Issue",
    description: "Post a comment on an issue as the agent",
    parameters: IssueCommentSchema,
    async execute(_id, params: IssueCommentInput, signal) {
      const result = await gh(pi, [
        "issue", "comment", String(params.number), "-R", params.repo, "-b", params.body,
      ], signal);

      return ghResultText(result, `Comment posted on issue #${params.number}`, {
        repo: params.repo, number: params.number,
      });
    },
  });

  // --- PR Tools ---

  pi.registerTool({
    name: "gh_pr_list",
    label: "List PRs",
    description: "List pull requests in a GitHub repository",
    parameters: PrListSchema,
    async execute(_id, params: PrListInput, signal) {
      const args = [
        "pr", "list", "-R", params.repo,
        "--json", "number,title,state,author,createdAt,headRefName,baseRefName",
        "-L", String(params.limit ?? 30),
      ];
      if (params.state) args.push("-s", params.state);

      return ghResult(await gh(pi, args, signal), { repo: params.repo });
    },
  });

  pi.registerTool({
    name: "gh_pr_read",
    label: "Read PR",
    description: "Get pull request details",
    parameters: PrReadSchema,
    async execute(_id, params: PrReadInput, signal) {
      const result = await gh(pi, [
        "pr", "view", String(params.number), "-R", params.repo,
        "--json", "number,title,state,body,author,createdAt,headRefName,baseRefName,additions,deletions,files,reviews,comments",
      ], signal);

      return ghResult(result, { repo: params.repo, number: params.number });
    },
  });

  pi.registerTool({
    name: "gh_pr_diff",
    label: "Get PR Diff",
    description: "Get the diff for a pull request",
    parameters: PrDiffSchema,
    async execute(_id, params: PrDiffInput, signal) {
      const result = await gh(pi, [
        "pr", "diff", String(params.number), "-R", params.repo,
      ], signal);

      return ghResult(result, { repo: params.repo, number: params.number });
    },
  });

  pi.registerTool({
    name: "gh_pr_create",
    label: "Create PR",
    description: "Create a pull request from a branch",
    parameters: PrCreateSchema,
    async execute(_id, params: PrCreateInput, signal) {
      const result = await gh(pi, [
        "pr", "create", "-R", params.repo,
        "-t", params.title, "-b", params.body,
        "-H", params.head, "-B", params.base,
      ], signal);

      return ghResultText(result, `PR created: ${result.stdout}`, {
        repo: params.repo, head: params.head, base: params.base,
      });
    },
  });

  pi.registerTool({
    name: "gh_pr_comment",
    label: "Comment on PR",
    description: "Post a comment on a pull request as the agent",
    parameters: PrCommentSchema,
    async execute(_id, params: PrCommentInput, signal) {
      const result = await gh(pi, [
        "pr", "comment", String(params.number), "-R", params.repo, "-b", params.body,
      ], signal);

      return ghResultText(result, `Comment posted on PR #${params.number}`, {
        repo: params.repo, number: params.number,
      });
    },
  });

  // --- File Read (gh-only mode) ---

  pi.registerTool({
    name: "gh_file_read",
    label: "Read File from GitHub",
    description: "Fetch file content from GitHub (not local filesystem)",
    parameters: FileReadSchema,
    async execute(_id, params: FileReadInput, signal) {
      const args = ["api", `/repos/${params.repo}/contents/${params.path}`, "--jq", ".content"];
      if (params.ref) args.push("-f", `ref=${params.ref}`);

      const result = await gh(pi, args, signal);
      if (result.code !== 0) {
        return { content: [{ type: "text", text: `Error: ${result.stderr}` }], isError: true };
      }

      const decoded = Buffer.from(result.stdout.trim(), "base64").toString("utf-8");
      return {
        content: [{ type: "text", text: decoded }],
        details: { repo: params.repo, path: params.path, ref: params.ref },
      };
    },
  });
}
