// @ts-nocheck
// Parallel Planner with Review — four-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             An opus agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names.
//   Phase 2 (Execute + Review): For each issue, a sandbox is created via
//                               createSandbox(). The implementer runs first
//                               (100 iterations). If it produces commits, a
//                               reviewer runs in the same sandbox on the same
//                               branch (1 iteration). All issue pipelines run
//                               concurrently via Promise.allSettled().
//   Phase 3 (Merge):            A single agent merges all completed branches
//                               into the current branch.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   pnpm sandcastle
// (runs `node --experimental-strip-types .sandcastle/main.ts` — Node 24's
// built-in type stripping handles this file's TS syntax, so no tsx/ts-node
// devDependency is needed. The flag is explicit because the `engines` floor
// is 22.12, where strip-types is opt-in.)

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import * as sandcastle from "@ai-hero/sandcastle";
import type { LoggingOption } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 5;

// Files that need to land in every worktree before the install hook runs.
// `git worktree add` checks out HEAD, so uncommitted edits in the host
// checkout are invisible inside the worktree. pnpm-workspace.yaml is the
// load-bearing case: pnpm 11 uses `allowBuilds` (replacing the deprecated
// `onlyBuiltDependencies`), and without the working-tree version of this
// file the in-container `pnpm install --frozen-lockfile` errors with
// ERR_PNPM_IGNORED_BUILDS for sharp/esbuild/etc.
const copyToWorktree = ["pnpm-workspace.yaml"];

// Hooks run inside the sandbox before the agent starts each iteration.
// pnpm install populates the workspace; --frozen-lockfile keeps it
// reproducible. Host node_modules is not copied: pnpm uses a symlinked
// virtual store (.pnpm/) that breaks when copied into a fresh container.
const hooks = {
  sandbox: {
    onSandboxReady: [
      { command: "corepack enable" },
      // Cold install in a fresh worktree+container has no pnpm-store cache
      // and can't hardlink across the bind-mount FS boundary, so it copies
      // every package. The default 60s hook timeout isn't enough; 5 min
      // covers a from-scratch install of this monorepo with margin.
      //
      // Redirect output to .sandcastle-pnpm-install.out inside the worktree
      // and delete on success. Sandcastle only surfaces the hook exit
      // code, so the redirect is the only way to recover pnpm's
      // diagnostics on failure. The .out extension avoids the repo's
      // root `*.log` gitignore: on failure the file is NOT gitignored,
      // which makes the worktree dirty and blocks sandcastle from
      // removing it — so the log survives for post-mortem. On success
      // we `rm` the file, the worktree is clean, sandcastle cleans up.
      {
        command:
          "pnpm install --frozen-lockfile >.sandcastle-pnpm-install.out 2>&1 && rm -f .sandcastle-pnpm-install.out",
        timeoutMs: 300_000,
      },
    ],
  },
};

// Stable timestamp used as the prefix for every log file in this run, so
// the four phases of one outer iteration sort together on disk.
const RUN_STARTED_AT = new Date().toISOString().replace(/[:.]/g, "-");

// ---------------------------------------------------------------------------
// Progress + summary logging
//
// Per-tool-call lines are too noisy when several agents run in parallel —
// instead we print a single dot per tool call to stdout (interleaved across
// agents) and, once an agent finishes, flush a structured summary block with
// timing, iteration/tool/commit counts, token usage, and the top tool names.
// Full transcripts still drain to `.sandcastle/logs/`.
// ---------------------------------------------------------------------------

const DOTS_PER_LINE = 80;
let dotsOnLine = 0;

function writeDot() {
  process.stdout.write(".");
  dotsOnLine += 1;
  if (dotsOnLine >= DOTS_PER_LINE) {
    process.stdout.write("\n");
    dotsOnLine = 0;
  }
}

function flushDots() {
  if (dotsOnLine > 0) {
    process.stdout.write("\n");
    dotsOnLine = 0;
  }
}

interface RunStats {
  toolCalls: number;
  toolNames: Map<string, number>;
}

function makeLogging(label: string, stats: RunStats): LoggingOption {
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, "-");
  return {
    type: "file",
    path: `.sandcastle/logs/${RUN_STARTED_AT}-${safe}.log`,
    onAgentStreamEvent: (event) => {
      if (event.type !== "toolCall") return;
      stats.toolCalls += 1;
      stats.toolNames.set(event.name, (stats.toolNames.get(event.name) ?? 0) + 1);
      writeDot();
    },
  };
}

function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

const TAIL_LINES = 5;

function tailLogFile(path: string): string[] {
  try {
    const lines = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.length > 0);
    return lines.slice(-TAIL_LINES);
  } catch {
    return [];
  }
}

function summarize(
  label: string,
  startedAt: number,
  stats: RunStats,
  result:
    | {
        iterations: { usage?: IterationUsage }[];
        commits: { sha: string }[];
        completionSignal?: string;
        logFilePath?: string;
      }
    | undefined,
  error?: unknown,
) {
  flushDots();
  const duration = formatDuration(Date.now() - startedAt);
  if (error) {
    console.log(`fail ${label} | ${duration} | tools=${stats.toolCalls} | ${error}`);
    return;
  }
  if (!result) return;

  const totals = result.iterations.reduce(
    (acc, it) => {
      if (it.usage) {
        acc.input += it.usage.inputTokens;
        acc.output += it.usage.outputTokens;
        acc.cacheRead += it.usage.cacheReadInputTokens;
        acc.cacheWrite += it.usage.cacheCreationInputTokens;
      }
      return acc;
    },
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );

  const top = [...stats.toolNames.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n, c]) => `${n}:${c}`)
    .join(" ");

  console.log(
    `done ${label} | ${duration} | iter=${result.iterations.length} tools=${stats.toolCalls} commits=${result.commits.length}`,
  );
  console.log(
    `     tokens in=${formatTokens(totals.input)} out=${formatTokens(totals.output)} cache=${formatTokens(totals.cacheRead)}r/${formatTokens(totals.cacheWrite)}w`,
  );
  if (top) console.log(`     top   ${top}`);
  if (result.completionSignal) console.log(`     signal ${result.completionSignal}`);
  if (result.logFilePath) {
    console.log(`     log ${result.logFilePath}`);
    const tail = tailLogFile(result.logFilePath);
    if (tail.length > 0) {
      console.log(`     tail:`);
      for (const line of tail) console.log(`       ${line}`);
    }
  }
}

interface IterationUsage {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
}

async function runWithSummary<
  R extends {
    iterations: { usage?: IterationUsage }[];
    commits: { sha: string }[];
    completionSignal?: string;
    logFilePath?: string;
  },
>(label: string, runFn: (logging: LoggingOption) => Promise<R>): Promise<R> {
  const startedAt = Date.now();
  const stats: RunStats = { toolCalls: 0, toolNames: new Map() };
  const logging = makeLogging(label, stats);
  try {
    const result = await runFn(logging);
    summarize(label, startedAt, stats, result);
    return result;
  } catch (e) {
    summarize(label, startedAt, stats, undefined, e);
    throw e;
  }
}

function logPhase(message: string) {
  flushDots();
  console.log(message);
}

// ---------------------------------------------------------------------------
// Worktree hygiene
//
// On macOS, Spotlight/Finder asynchronously recreate `.DS_Store` files inside
// `.sandcastle/worktrees/`. That races against sandcastle's
// `git worktree remove --force` cleanup: git deletes the dir's contents but
// the final `rmdir` sees a freshly-recreated `.DS_Store`, fails with
// "Directory not empty", and sandcastle throws — killing the whole run and
// leaving orphan worktree dirs behind.
//
// Three defenses, used together:
//   1. Drop `.metadata_never_index` so Spotlight ignores the worktrees tree
//      (drastically reduces but does not eliminate `.DS_Store` creation).
//   2. At orchestrator startup, sweep any orphan dirs left from a previous
//      run, with retries so we ride out the Finder race.
//   3. While the orchestrator is alive, run a low-frequency timer that
//      deletes any `.DS_Store` files under `.sandcastle/worktrees/`. This
//      narrows the window during which sandcastle's own `git worktree
//      remove --force` can race against a freshly-recreated `.DS_Store`.
// ---------------------------------------------------------------------------

const WORKTREES_DIR = ".sandcastle/worktrees";

function disableSpotlightForWorktrees() {
  mkdirSync(WORKTREES_DIR, { recursive: true });
  const marker = join(WORKTREES_DIR, ".metadata_never_index");
  if (!existsSync(marker)) writeFileSync(marker, "");
}

async function cleanupOrphanWorktrees() {
  if (!existsSync(WORKTREES_DIR)) return;

  // git canonicalises paths via realpath; do the same on our side so set
  // membership works when the repo lives under a symlinked path.
  const realWorktreesDir = realpathSync(WORKTREES_DIR);
  const listing = execFileSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  const activePaths = new Set(
    listing
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length).trim()),
  );

  for (const entry of readdirSync(realWorktreesDir)) {
    if (entry.startsWith(".")) continue;
    const path = join(realWorktreesDir, entry);
    if (!statSync(path).isDirectory()) continue;
    if (activePaths.has(path)) continue;

    let removed = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        rmSync(path, { recursive: true, force: true, maxRetries: 5 });
        removed = true;
        break;
      } catch (err) {
        // `.DS_Store` recreation race — wait and retry.
        if (attempt === 7) {
          console.warn(`could not remove orphan worktree ${path}: ${err}`);
          break;
        }
        await sleep(200);
      }
    }
    if (removed) console.log(`cleaned orphan worktree ${entry}`);
  }

  // Reconcile git's worktree registry with whatever is left on disk.
  try {
    execFileSync("git", ["worktree", "prune"], { stdio: "ignore" });
  } catch {
    // best-effort
  }
}

function startDSStoreKiller(): () => void {
  const tick = () => {
    try {
      execFileSync("find", [WORKTREES_DIR, "-name", ".DS_Store", "-delete"], {
        stdio: "ignore",
      });
    } catch {
      // best-effort; find returns non-zero if the dir disappeared mid-walk
    }
  };
  const handle = setInterval(tick, 250);
  handle.unref();
  return () => clearInterval(handle);
}

disableSpotlightForWorktrees();
await cleanupOrphanWorktrees();
const stopDSStoreKiller = startDSStoreKiller();

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  logPhase(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent (opus, for deeper reasoning) reads the open issue list,
  // builds a dependency graph, and selects the issues that can be worked in
  // parallel right now (i.e., no blocking dependencies on other open issues).
  //
  // It outputs a <plan> JSON block — we parse that to drive Phase 2.
  // -------------------------------------------------------------------------
  const plan = await runWithSummary(`iter${iteration}-planner`, (logging) =>
    sandcastle.run({
      hooks,
      copyToWorktree,
      sandbox: docker(),
      // docker() is a bind-mount provider; without this, run() defaults to
      // { type: "head" } and bind-mounts the host repo directly. The
      // onSandboxReady `pnpm install --frozen-lockfile` hook would then
      // detect the macOS-built node_modules as platform-incompatible and
      // delete it (CI=true auto-confirms the prompt) — wiping the host's
      // node_modules through the bind-mount. merge-to-head forces a git
      // worktree so the install only touches the worktree's copy.
      branchStrategy: { type: "merge-to-head" },
      name: "planner",
      // One iteration is enough: the planner just needs to read and reason,
      // not write code.
      maxIterations: 1,
      // Opus for planning: dependency analysis benefits from deeper reasoning.
      agent: sandcastle.claudeCode("claude-opus-4-6"),
      promptFile: "./.sandcastle/plan-prompt.md",
      logging,
    }),
  );

  // Extract the <plan>…</plan> block from the agent's stdout.
  const planMatch = plan.stdout.match(/<plan>([\s\S]*?)<\/plan>/);
  if (!planMatch) {
    throw new Error("Planning agent did not produce a <plan> tag.\n\n" + plan.stdout);
  }

  // The plan JSON contains an array of issues, each with id, title, branch.
  const { issues } = JSON.parse(planMatch[1]!) as {
    issues: { id: string; title: string; branch: string }[];
  };

  if (issues.length === 0) {
    // No unblocked work — either everything is done or everything is blocked.
    logPhase("No unblocked issues to work on. Exiting.");
    break;
  }

  logPhase(`Planning complete. ${issues.length} issue(s) to work in parallel:`);
  for (const issue of issues) {
    console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
  }

  // -------------------------------------------------------------------------
  // Phase 2: Execute + Review
  //
  // For each issue, create a sandbox via createSandbox() so the implementer
  // and reviewer share the same sandbox instance per branch. The implementer
  // runs first; if it produces commits, the reviewer runs in the same sandbox.
  //
  // Promise.allSettled means one failing pipeline doesn't cancel the others.
  // -------------------------------------------------------------------------

  const settled = await Promise.allSettled(
    issues.map(async (issue) => {
      const sandbox = await sandcastle.createSandbox({
        branch: issue.branch,
        sandbox: docker(),
        hooks,
        copyToWorktree,
      });

      try {
        // Run the implementer. Sonnet 4.6 is the implementation workhorse:
        // cheaper and faster than Opus, and the planner has already done
        // the cross-issue dependency reasoning that benefits from depth.
        const implement = await runWithSummary(
          `iter${iteration}-implementer-${issue.id}`,
          (logging) =>
            sandbox.run({
              name: "implementer",
              maxIterations: 100,
              agent: sandcastle.claudeCode("claude-sonnet-4-6"),
              promptFile: "./.sandcastle/implement-prompt.md",
              promptArgs: {
                TASK_ID: issue.id,
                ISSUE_TITLE: issue.title,
                BRANCH: issue.branch,
              },
              logging,
            }),
        );

        // Only review if the implementer produced commits
        if (implement.commits.length > 0) {
          const review = await runWithSummary(`iter${iteration}-reviewer-${issue.id}`, (logging) =>
            sandbox.run({
              name: "reviewer",
              maxIterations: 1,
              agent: sandcastle.claudeCode("claude-opus-4-6"),
              promptFile: "./.sandcastle/review-prompt.md",
              promptArgs: {
                BRANCH: issue.branch,
              },
              logging,
            }),
          );

          // Merge commits from both runs so the merge phase sees all of them.
          // Each sandbox.run() only returns commits from its own run.
          return {
            ...review,
            commits: [...implement.commits, ...review.commits],
          };
        }

        return implement;
      } finally {
        await sandbox.close();
      }
    }),
  );

  // Log any agents that threw (network error, sandbox crash, etc.).
  // (Per-agent failure summaries are already printed by runWithSummary; this
  // is a final compact roll-up of which issues didn't make it.)
  flushDots();
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      console.error(`  ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`);
    }
  }

  // Only pass branches that actually produced commits to the merge phase.
  // An agent that ran successfully but made no commits has nothing to merge.
  const completedIssues = settled
    .map((outcome, i) => ({ outcome, issue: issues[i]! }))
    .filter(
      (entry) => entry.outcome.status === "fulfilled" && entry.outcome.value.commits.length > 0,
    )
    .map((entry) => entry.issue);

  const completedBranches = completedIssues.map((i) => i.branch);

  logPhase(`\nExecution complete. ${completedBranches.length} branch(es) with commits:`);
  for (const branch of completedBranches) {
    console.log(`  ${branch}`);
  }

  if (completedBranches.length === 0) {
    // All agents ran but none made commits — nothing to merge this cycle.
    logPhase("No commits produced. Nothing to merge.");
    continue;
  }

  // -------------------------------------------------------------------------
  // Phase 3: Merge
  //
  // One agent merges all completed branches into the current branch,
  // resolving any conflicts and running tests to confirm everything works.
  //
  // The {{BRANCHES}} and {{ISSUES}} prompt arguments are lists that the agent
  // uses to know which branches to merge and which issues to close.
  // -------------------------------------------------------------------------
  await runWithSummary(`iter${iteration}-merger`, (logging) =>
    sandcastle.run({
      hooks,
      copyToWorktree,
      sandbox: docker(),
      // See planner above: without an explicit branchStrategy the docker
      // bind-mount provider defaults to "head" and exposes host node_modules
      // to the in-container pnpm install. merge-to-head puts the merger in
      // a worktree; its merge commits get fast-forwarded back into head on
      // sandbox close, so the end state on the host's branch is unchanged.
      branchStrategy: { type: "merge-to-head" },
      name: "merger",
      maxIterations: 1,
      agent: sandcastle.claudeCode("claude-opus-4-6"),
      promptFile: "./.sandcastle/merge-prompt.md",
      promptArgs: {
        // A markdown list of branch names, one per line.
        BRANCHES: completedBranches.map((b) => `- ${b}`).join("\n"),
        // A markdown list of issue IDs and titles, one per line.
        ISSUES: completedIssues.map((i) => `- ${i.id}: ${i.title}`).join("\n"),
      },
      logging,
    }),
  );

  logPhase("\nBranches merged.");
}

stopDSStoreKiller();
logPhase("\nAll done.");
