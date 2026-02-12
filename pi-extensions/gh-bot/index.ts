/**
 * GitHub Bot Extension
 *
 * Provides GitHub tools with an identity toggle:
 * - `/gh-bot off` (default): GitHub operations use your personal `gh` CLI auth
 * - `/gh-bot on`: GitHub operations use GitHub App credentials (appears as bot)
 *
 * All built-in tools (bash, read, edit, write) remain available—no sandboxing.
 *
 * Usage:
 *   pi -e ./pi-extensions/gh-bot
 *
 * Tools:
 *   gh_issue_list        - List issues
 *   gh_issue_read        - Get issue details + comments
 *   gh_issue_comment     - Post comment on issue
 *   gh_issue_create      - Create a new issue
 *   gh_pr_list           - List pull requests
 *   gh_pr_read           - Get PR details
 *   gh_pr_diff           - Get PR diff
 *   gh_pr_create         - Create PR from branch
 *   gh_pr_comment        - Post comment on PR
 *   gh_pr_request_review - Request reviewers on a PR
 *   gh_pr_review         - Submit a review (approve, request changes, comment)
 *   gh_file_read         - Fetch file from GitHub
 *
 * Commands:
 *   /gh-bot [on|off]     - Toggle bot identity for GitHub operations
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { getInstallationToken, clearTokenCache } from "./auth.js";

// --- State ---

let useBotAuth = false;

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

const IssueCreateSchema = Type.Object({
  repo: RepoParam,
  title: Type.String({ description: "Issue title" }),
  body: Type.Optional(Type.String({ description: "Issue body (markdown)" })),
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

const PrRequestReviewSchema = Type.Object({
  repo: RepoParam,
  number: PrNumber,
  reviewers: Type.Array(Type.String({ description: "GitHub username" }), {
    description: "List of GitHub usernames to request review from",
    minItems: 1,
  }),
});

const PrReviewSchema = Type.Object({
  repo: RepoParam,
  number: PrNumber,
  event: StringEnum(["approve", "request_changes", "comment"] as const, {
    description: "Review action: approve, request_changes, or comment",
  }),
  body: Type.Optional(Type.String({
    description: "Review body (required for request_changes and comment)",
  })),
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
export type IssueCreateInput = Static<typeof IssueCreateSchema>;
export type PrListInput = Static<typeof PrListSchema>;
export type PrReadInput = Static<typeof PrReadSchema>;
export type PrDiffInput = Static<typeof PrDiffSchema>;
export type PrCreateInput = Static<typeof PrCreateSchema>;
export type PrCommentInput = Static<typeof PrCommentSchema>;
export type PrRequestReviewInput = Static<typeof PrRequestReviewSchema>;
export type PrReviewInput = Static<typeof PrReviewSchema>;
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

function isAuthError(stderr: string): boolean {
  return /401|Bad credentials|authentication|unauthorized/i.test(stderr);
}

async function gh(
  pi: ExtensionAPI,
  args: string[],
  signal?: AbortSignal
): Promise<ExecResult> {
  if (!useBotAuth) {
    // Use personal gh CLI auth
    return pi.exec("gh", args, { signal });
  }

  // Use GitHub App token
  const token = await getInstallationToken();

  const result = await pi.exec("gh", args, {
    signal,
    env: { ...process.env, GH_TOKEN: token },
  });

  // Retry once on auth error (token may have expired)
  if (result.code !== 0 && isAuthError(result.stderr)) {
    clearTokenCache();
    const newToken = await getInstallationToken();
    if (newToken !== token) {
      return pi.exec("gh", args, {
        signal,
        env: { ...process.env, GH_TOKEN: newToken },
      });
    }
  }

  return result;
}

// --- Extension ---

export default function ghBotExtension(pi: ExtensionAPI) {
  // Register tools at load time (always available)
  registerGhTools(pi);

  // Toggle command
  pi.registerCommand("gh-bot", {
    description: "Toggle GitHub bot identity (on/off)",
    handler: async (args, ctx) => {
      const arg = args?.trim().toLowerCase();
      if (arg === "on") {
        useBotAuth = true;
      } else if (arg === "off") {
        useBotAuth = false;
      } else {
        useBotAuth = !useBotAuth;
      }

      ctx.ui.setStatus("gh-bot", useBotAuth ? "🤖 bot" : undefined);
      ctx.ui.notify(`GitHub: ${useBotAuth ? "bot (App)" : "you (gh CLI)"}`);

      pi.appendEntry("gh-bot", { enabled: useBotAuth });
    },
  });

  // Restore state on session resume
  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const lastState = entries
      .filter((e) => e.type === "custom" && e.customType === "gh-bot")
      .pop();

    if (lastState?.data?.enabled) {
      useBotAuth = true;
      ctx.ui.setStatus("gh-bot", "🤖 bot");
    }
  });
}

function registerGhTools(pi: ExtensionAPI) {
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
    description: "Post a comment on an issue",
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

  pi.registerTool({
    name: "gh_issue_create",
    label: "Create Issue",
    description: "Create a new issue in a GitHub repository",
    parameters: IssueCreateSchema,
    async execute(_id, params: IssueCreateInput, signal) {
      const args = ["issue", "create", "-R", params.repo, "-t", params.title];
      if (params.body) {
        args.push("-b", params.body);
      }

      const result = await gh(pi, args, signal);

      return ghResultText(result, `Issue created: ${result.stdout}`, {
        repo: params.repo,
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
    description: "Post a comment on a pull request",
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

  pi.registerTool({
    name: "gh_pr_request_review",
    label: "Request PR Review",
    description: "Request review from one or more GitHub users on a pull request",
    parameters: PrRequestReviewSchema,
    async execute(_id, params: PrRequestReviewInput, signal) {
      const args = [
        "pr", "edit", String(params.number), "-R", params.repo,
      ];
      for (const reviewer of params.reviewers) {
        args.push("--add-reviewer", reviewer);
      }

      const result = await gh(pi, args, signal);

      return ghResultText(result, `Review requested from: ${params.reviewers.join(", ")}`, {
        repo: params.repo, number: params.number, reviewers: params.reviewers,
      });
    },
  });

  pi.registerTool({
    name: "gh_pr_review",
    label: "Submit PR Review",
    description: "Submit a review on a pull request (approve, request changes, or comment)",
    parameters: PrReviewSchema,
    async execute(_id, params: PrReviewInput, signal) {
      // Body is required for request_changes and comment
      if ((params.event === "request_changes" || params.event === "comment") && !params.body) {
        return {
          content: [{ type: "text", text: `Error: body is required for ${params.event} reviews` }],
          isError: true,
        };
      }

      const eventFlag = {
        approve: "--approve",
        request_changes: "--request-changes",
        comment: "--comment",
      }[params.event];

      const args = [
        "pr", "review", String(params.number), "-R", params.repo, eventFlag,
      ];
      if (params.body) {
        args.push("-b", params.body);
      }

      const result = await gh(pi, args, signal);

      const actionText = {
        approve: "Approved",
        request_changes: "Requested changes on",
        comment: "Commented on",
      }[params.event];

      return ghResultText(result, `${actionText} PR #${params.number}`, {
        repo: params.repo, number: params.number, event: params.event,
      });
    },
  });

  // --- File Read ---

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
