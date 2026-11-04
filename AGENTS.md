# AGENTS.md

> **Agent guardrails:** all agents must follow the shared rulebook at https://github.com/devonte-amos-apps/pr-intelligence/blob/main/AGENT_RULES.md. It overrides anything in this file that conflicts with it.

For application changes, follow [the regression standard](docs/testing/regression-policy.md).
Map new source/tests in `tools/regression/catalog.json`, add or update the
affected feature's regression evidence, and run `npm run test:regression` before
handoff. Preserve existing tests/thresholds. New feature suites follow the
70/20/10 pyramid; report inherited conditional checks as unverified.
