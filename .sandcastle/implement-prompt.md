# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view <ID>`. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run tests.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Pay extra attention to test files that touch the relevant parts of the code.

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

# FEEDBACK LOOPS

Before committing, run `vp check` (format + lint + types) and `vp run -r test` (recursive across the workspace) to ensure everything passes. Do not invoke pnpm/npm/yarn or vitest/oxlint/tsdown directly — Vite+ wraps them.

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

## Commit hygiene — do not break this

- **Never run `git add -A` or `git add .`**. Always `git add` explicit, named files — the source files you intentionally edited.
- **Never stage `.pnpm-store/`, `node_modules/`, `.astro/`, `dist/`, `.cache/`, or any tool-generated directory** — even if `git status` shows them as untracked.
- If `vp install` updates `pnpm-lock.yaml` and your task is the cause, stage that file; otherwise leave it.
- If `git status` after `vp check` or `vp install` shows files you didn't expect, treat that as a bug to investigate, not noise to commit through.

# THE ISSUE

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue - this will be done later.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
