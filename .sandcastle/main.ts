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

import * as sandcastle from "@ai-hero/sandcastle";
import type { LoggingOption } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 20;

// Hooks run inside the sandbox before the agent starts each iteration.
// pnpm install populates the workspace; --frozen-lockfile keeps it
// reproducible. Host node_modules is not copied: pnpm uses a symlinked
// virtual store (.pnpm/) that breaks when copied into a fresh container.
const hooks = {
  sandbox: {
    onSandboxReady: [{ command: "corepack enable" }, { command: "pnpm install --frozen-lockfile" }],
  },
};

// Stable timestamp used as the prefix for every log file in this run, so
// the four phases of one outer iteration sort together on disk.
const RUN_STARTED_AT = new Date().toISOString().replace(/[:.]/g, "-");

/**
 * Build a `logging` option for a single agent run. Each run still drains
 * its full transcript to a file under `.sandcastle/logs/` (default
 * sandcastle behaviour), and `onAgentStreamEvent` mirrors a one-line
 * progress summary per tool call to the orchestrator's stdout — so you
 * can watch what the implementer/reviewer is doing without tailing
 * 15 separate log files.
 *
 * Text chunks are intentionally suppressed from stdout (they're verbose
 * and already in the file log); only tool calls surface live.
 */
function makeLogging(label: string): LoggingOption {
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, "-");
  return {
    type: "file",
    path: `.sandcastle/logs/${RUN_STARTED_AT}-${safe}.log`,
    onAgentStreamEvent: (event) => {
      if (event.type !== "toolCall") return;
      const firstLine = event.formattedArgs.split("\n")[0] ?? "";
      const trimmed = firstLine.length > 100 ? firstLine.slice(0, 97) + "…" : firstLine;
      const suffix = trimmed ? ` ${trimmed}` : "";
      console.log(`[${label}] ${event.name}${suffix}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent (opus, for deeper reasoning) reads the open issue list,
  // builds a dependency graph, and selects the issues that can be worked in
  // parallel right now (i.e., no blocking dependencies on other open issues).
  //
  // It outputs a <plan> JSON block — we parse that to drive Phase 2.
  // -------------------------------------------------------------------------
  const plan = await sandcastle.run({
    hooks,
    sandbox: docker(),
    name: "planner",
    // One iteration is enough: the planner just needs to read and reason,
    // not write code.
    maxIterations: 1,
    // Opus for planning: dependency analysis benefits from deeper reasoning.
    agent: sandcastle.claudeCode("claude-opus-4-6"),
    promptFile: "./.sandcastle/plan-prompt.md",
    logging: makeLogging(`iter${iteration}-planner`),
  });

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
    console.log("No unblocked issues to work on. Exiting.");
    break;
  }

  console.log(`Planning complete. ${issues.length} issue(s) to work in parallel:`);
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
      });

      try {
        // Run the implementer. Sonnet 4.6 is the implementation workhorse:
        // cheaper and faster than Opus, and the planner has already done
        // the cross-issue dependency reasoning that benefits from depth.
        const implement = await sandbox.run({
          name: "implementer",
          maxIterations: 100,
          agent: sandcastle.claudeCode("claude-sonnet-4-6"),
          promptFile: "./.sandcastle/implement-prompt.md",
          promptArgs: {
            TASK_ID: issue.id,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
          },
          logging: makeLogging(`iter${iteration}-implementer-${issue.id}`),
        });

        // Only review if the implementer produced commits
        if (implement.commits.length > 0) {
          const review = await sandbox.run({
            name: "reviewer",
            maxIterations: 1,
            agent: sandcastle.claudeCode("claude-opus-4-6"),
            promptFile: "./.sandcastle/review-prompt.md",
            promptArgs: {
              BRANCH: issue.branch,
            },
            logging: makeLogging(`iter${iteration}-reviewer-${issue.id}`),
          });

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
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      console.error(`  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`);
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

  console.log(`\nExecution complete. ${completedBranches.length} branch(es) with commits:`);
  for (const branch of completedBranches) {
    console.log(`  ${branch}`);
  }

  if (completedBranches.length === 0) {
    // All agents ran but none made commits — nothing to merge this cycle.
    console.log("No commits produced. Nothing to merge.");
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
  await sandcastle.run({
    hooks,
    sandbox: docker(),
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
    logging: makeLogging(`iter${iteration}-merger`),
  });

  console.log("\nBranches merged.");
}

console.log("\nAll done.");
