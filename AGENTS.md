# AGENTS.md

> **Agent guardrails:** all agents must follow the shared rulebook at https://github.com/devonte-amos-apps/pr-intelligence/blob/main/AGENT_RULES.md. It overrides anything in this file that conflicts with it.

For application changes, follow [the regression standard](docs/testing/regression-policy.md).
Map new source/tests in `tools/regression/catalog.json`, add or update the
affected feature's regression evidence, and run `npm run test:regression` before
handoff. Preserve existing tests/thresholds. New feature suites follow the
70/20/10 pyramid; report inherited conditional checks as unverified.

## One issue, one branch, one PR

Agents must follow this workflow for engineering work:

- One GitHub issue maps to one branch and one pull request.
- Name the branch `<type>/<issue-number>-<slug>`, for example `fix/19-coverage-gate` or `feature/4-cross-device-sync`. Use `feature`, `fix`, `hotfix`, `revert` or `chore` as the type.
- The PR body must include `Closes #<issue>`. One issue per PR.
- Do not reuse a branch across issues. Start a fresh branch from the default branch for the next issue.
- If a later PR supersedes an earlier one, link the old PR, comment that it is superseded, and close the old PR in the same step. Do not leave parallel agent branches open for the same work.
