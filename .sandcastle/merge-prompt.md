# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`
2. If there are merge conflicts, resolve them intelligently by reading both sides and choosing the correct resolution
3. After resolving conflicts, run `vp check` (format + lint + types) and `vp run -r test` (recursive) to verify everything works. Do not invoke pnpm/npm/yarn or vitest/oxlint/tsdown directly — Vite+ wraps them.
4. If tests fail, fix the issues before proceeding to the next branch

After all branches are merged, make a single commit summarizing the merge.

# COMMIT HYGIENE — DO NOT BREAK THIS

- **Never run `git add -A` or `git add .`**. Always `git add` explicit, named files (the conflicted files you resolved, and nothing else).
- **Never stage `.pnpm-store/`, `node_modules/`, `.astro/`, `dist/`, `.cache/`, or any tool-generated directory** — even if `git status` shows them. They are install artifacts, not source.
- If you ran `vp install` and the lockfile changed, only stage `pnpm-lock.yaml` if the lockfile diff was caused by your conflict resolution; otherwise leave it.
- If `git status` shows surprising untracked files after `vp check` or `vp install`, treat that as a bug to investigate, not noise to commit through.

A previous run of this orchestration committed 651MB of `.pnpm-store/` into `main` because the merger ran `git add -A`. Do not repeat that.

# CLOSE ISSUES

For each branch that was merged, close its issue using the following command:

`gh issue close <ID> --comment "Completed by Sandcastle"`

Here are all the issues:

{{ISSUES}}

Once you've merged everything you can, output <promise>COMPLETE</promise>.
