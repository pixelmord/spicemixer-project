# ISSUES

The `<issues-json>` block below is the **authoritative** set of candidates. It is pre-filtered to issues labeled `ready-for-agent`. Do **not** re-query GitHub for more issues, do **not** consider issues outside this list, and do **not** strip the label filter — issues without `ready-for-agent` are intentionally excluded.

If `<issues-json>` is empty or `[]`, output `<plan>{"issues": []}</plan>` and stop. An empty list is a valid result, not an error.

<issues-json>

!`gh issue list --state open --label ready-for-agent --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`

</issues-json>

# TASK

Analyze the open issues and build a dependency graph. For each issue, determine whether it **blocks** or **is blocked by** any other open issue.

An issue B is **blocked by** issue A if:

- B requires code or infrastructure that A introduces
- B and A modify overlapping files or modules, making concurrent work likely to produce merge conflicts
- B's requirements depend on a decision or API shape that A will establish

An issue is **unblocked** if it has zero blocking dependencies on other open issues.

## Parent / epic / tracker issues

Some issues in `<issues-json>` are **trackers**, not implementable units. Detect them and exclude them from the unblocked set even if they look dependency-free.

An issue P is a tracker if **any** of the following holds:

- Another open issue C in `<issues-json>` declares P as its parent — e.g. C's body contains `## Parent` followed by `#P`, or `Parent: #P`, or `Epic: #P`, or `Tracks: #P`.
- P's body describes itself as an epic/PRD/parent that decomposes into other issues (e.g. lists `#125, #126, #127 …` as sub-issues, says "this issue tracks", "parent issue for", or links to a multi-issue plan).
- P's title contains markers like "Epic:", "Parent:", "Tracker:", "[EPIC]".

When P is a tracker, the actual work lives in its children. Pick the unblocked child(ren) instead. If every child of P is closed and P is still open, it is residual tracker state — still skip P; a human will close it. Never select a tracker as a work item.

For each unblocked issue, assign a branch name. **Reuse existing branches when possible**:

1. Run `git branch --list 'sandcastle/issue-{id}-*'` for each issue.
2. If a branch already exists, use that exact name (so the implementer resumes prior work in the same worktree).
3. Otherwise, create a new name using the format `sandcastle/issue-{id}-{slug}`.

Generating a fresh slug for an issue that already has a branch produces duplicate branches and orphaned worktrees — always prefer the existing branch.

# OUTPUT

Output your plan as a JSON object wrapped in `<plan>` tags:

<plan>
{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42-fix-auth-bug"}]}
</plan>

Include only unblocked issues from `<issues-json>`. If every issue in `<issues-json>` is blocked, output `<plan>{"issues": []}</plan>` — do not pick a fallback candidate, and never include an issue absent from `<issues-json>`.
