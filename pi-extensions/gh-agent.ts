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
 *   pi -e ./pi-extensions/gh-agent.ts --gh-only # GitHub-only: sandboxed temp workspace
 *
 * Tools (all modes):
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
 *
 * Tools (--gh-only mode only):
 *   gh_file_read     - Fetch file from GitHub
 *   gh_clone         - Clone repo to sandboxed temp directory
 *   tmp_read         - Read file in sandbox
 *   tmp_write        - Write file in sandbox
 *   tmp_exec         - Execute command in sandbox
 *   tmp_list         - List directory in sandbox
 *
 * Security note: tmp_exec commands run with cwd locked to the sandbox, but can
 * still access paths outside via absolute paths (e.g., /etc/passwd). This is
 * intentional to allow running tests, builds, and other development commands.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

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

// --- Sandbox Schemas (--gh-only mode) ---

const CloneSchema = Type.Object({
  repo: RepoParam,
  ref: Type.Optional(Type.String({ description: "Branch, tag, or commit to checkout after clone" })),
});

const TmpPathParam = Type.String({ description: "Path relative to sandbox root" });

const TmpReadSchema = Type.Object({
  path: TmpPathParam,
});

const TmpWriteSchema = Type.Object({
  path: TmpPathParam,
  content: Type.String({ description: "Content to write" }),
});

const TmpExecSchema = Type.Object({
  command: Type.String({ description: "Command to execute" }),
  cwd: Type.Optional(Type.String({ description: "Working directory relative to sandbox root" })),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 60)" })),
});

const TmpListSchema = Type.Object({
  path: Type.Optional(TmpPathParam),
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
export type CloneInput = Static<typeof CloneSchema>;
export type TmpReadInput = Static<typeof TmpReadSchema>;
export type TmpWriteInput = Static<typeof TmpWriteSchema>;
export type TmpExecInput = Static<typeof TmpExecSchema>;
export type TmpListInput = Static<typeof TmpListSchema>;

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

// --- Sandbox Helpers ---

let sandboxPromise: Promise<string> | null = null;

async function getSandboxDir(): Promise<string> {
  return sandboxPromise ??= fs.mkdtemp(path.join(os.tmpdir(), "pi-gh-sandbox-"));
}

async function cleanupSandbox(): Promise<void> {
  if (sandboxPromise) {
    const dir = await sandboxPromise;
    await fs.rm(dir, { recursive: true, force: true });
    sandboxPromise = null;
  }
}

function resolveSandboxPath(sandbox: string, relativePath: string): string | null {
  const resolved = path.resolve(sandbox, relativePath);
  // Ensure the resolved path is within the sandbox
  if (!resolved.startsWith(sandbox + path.sep) && resolved !== sandbox) {
    return null;
  }
  return resolved;
}

function sandboxError(message: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
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
        "gh_issue_list", "gh_issue_read", "gh_issue_comment", "gh_issue_create",
        "gh_pr_list", "gh_pr_read", "gh_pr_diff", "gh_pr_create", "gh_pr_comment",
        "gh_pr_request_review", "gh_pr_review",
        "gh_file_read", "gh_clone",
        "tmp_read", "tmp_write", "tmp_exec", "tmp_list",
      ]);
      ctx.ui.notify("GitHub-only mode: sandboxed workspace enabled", "info");
    }
  });

  pi.on("session_end", async () => {
    await cleanupSandbox();
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

  // --- Sandbox Tools (gh-only mode) ---

  pi.registerTool({
    name: "gh_clone",
    label: "Clone Repository",
    description: "Clone a GitHub repository to the sandboxed temp directory",
    parameters: CloneSchema,
    async execute(_id, params: CloneInput, signal) {
      const sandbox = await getSandboxDir();
      const repoName = params.repo.split("/")[1];
      const targetDir = path.join(sandbox, repoName);

      // Check if already cloned
      try {
        await fs.access(targetDir);
        return sandboxError(`Repository already cloned at ${repoName}/`);
      } catch {
        // Directory doesn't exist, proceed with clone
      }

      const result = await gh(pi, [
        "repo", "clone", params.repo, targetDir, "--", "--depth=1",
      ], signal);

      if (result.code !== 0) {
        return { content: [{ type: "text", text: `Error: ${result.stderr}` }], isError: true };
      }

      // Checkout specific ref if requested
      let refWarning = "";
      if (params.ref) {
        const fetchResult = await pi.exec("git", ["-C", targetDir, "fetch", "origin", params.ref], { signal });
        if (fetchResult.code === 0) {
          await pi.exec("git", ["-C", targetDir, "checkout", params.ref], { signal });
        } else {
          refWarning = ` (warning: could not checkout ref '${params.ref}')`;
        }
      }

      return {
        content: [{ type: "text", text: `Cloned ${params.repo} to ${repoName}/${refWarning}` }],
        details: { repo: params.repo, path: repoName, ref: params.ref },
      };
    },
  });

  pi.registerTool({
    name: "tmp_read",
    label: "Read File (Sandbox)",
    description: "Read a file from the sandboxed temp directory",
    parameters: TmpReadSchema,
    async execute(_id, params: TmpReadInput) {
      const sandbox = await getSandboxDir();
      const resolved = resolveSandboxPath(sandbox, params.path);

      if (!resolved) {
        return sandboxError("Path escapes sandbox");
      }

      try {
        const content = await fs.readFile(resolved, "utf-8");
        return {
          content: [{ type: "text", text: content }],
          details: { path: params.path },
        };
      } catch (err) {
        return sandboxError(`Failed to read file: ${(err as Error).message}`);
      }
    },
  });

  pi.registerTool({
    name: "tmp_write",
    label: "Write File (Sandbox)",
    description: "Write a file to the sandboxed temp directory",
    parameters: TmpWriteSchema,
    async execute(_id, params: TmpWriteInput) {
      const sandbox = await getSandboxDir();
      const resolved = resolveSandboxPath(sandbox, params.path);

      if (!resolved) {
        return sandboxError("Path escapes sandbox");
      }

      try {
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, params.content, "utf-8");
        return {
          content: [{ type: "text", text: `Wrote ${params.content.length} bytes to ${params.path}` }],
          details: { path: params.path, bytes: params.content.length },
        };
      } catch (err) {
        return sandboxError(`Failed to write file: ${(err as Error).message}`);
      }
    },
  });

  pi.registerTool({
    name: "tmp_exec",
    label: "Execute Command (Sandbox)",
    description: "Execute a command in the sandboxed temp directory",
    parameters: TmpExecSchema,
    async execute(_id, params: TmpExecInput, signal) {
      const sandbox = await getSandboxDir();
      let cwd = sandbox;

      if (params.cwd) {
        const resolved = resolveSandboxPath(sandbox, params.cwd);
        if (!resolved) {
          return sandboxError("Working directory escapes sandbox");
        }
        cwd = resolved;
      }

      const timeout = (params.timeout ?? 60) * 1000;
      const result = await pi.exec("bash", ["-c", params.command], {
        cwd,
        signal,
        timeout,
      });

      const output = result.stdout + (result.stderr ? `\n${result.stderr}` : "");
      return {
        content: [{ type: "text", text: output || "(no output)" }],
        details: { code: result.code, cwd: params.cwd ?? "." },
        isError: result.code !== 0,
      };
    },
  });

  pi.registerTool({
    name: "tmp_list",
    label: "List Directory (Sandbox)",
    description: "List contents of a directory in the sandboxed temp directory",
    parameters: TmpListSchema,
    async execute(_id, params: TmpListInput) {
      const sandbox = await getSandboxDir();
      const targetPath = params.path ?? ".";
      const resolved = resolveSandboxPath(sandbox, targetPath);

      if (!resolved) {
        return sandboxError("Path escapes sandbox");
      }

      try {
        const entries = await fs.readdir(resolved, { withFileTypes: true });
        const listing = entries.map((e) => {
          const suffix = e.isDirectory() ? "/" : "";
          return `${e.name}${suffix}`;
        }).join("\n");

        return {
          content: [{ type: "text", text: listing || "(empty directory)" }],
          details: { path: targetPath, count: entries.length },
        };
      } catch (err) {
        return sandboxError(`Failed to list directory: ${(err as Error).message}`);
      }
    },
  });
}
