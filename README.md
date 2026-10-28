# ReadyGate

A Rovo agent for Jira that gates every issue against your team's **Definition of Ready**: it scores the issue, lists exactly what is missing, drafts the missing sections, and applies them after you confirm.

Runs on Atlassian Forge (no remotes, no data leaves your site). Built for Codegeist 2026.

## What it does

- **Rovo agent `ReadyGate`**: ask "Check this issue against our Definition of Ready". The agent calls a deterministic rule engine (no LLM cost for the check), reports the score and gaps, drafts the missing parts (acceptance criteria as Given/When/Then, repro steps, expected/actual result, environment), and writes them to the issue only after you say yes.
- **Issue panel "Readiness"**: score badge, checklist of gaps with hints, Re-check button, on every issue.
- **Per-project policy**: threshold, rule on/off, weights and custom regex rules stored in Forge KVS (`policy:<PROJECTKEY>`), shared by the agent and the panel.

## Rules (defaults)

| Rule | Applies to | Severity | Weight |
|---|---|---|---|
| Clear summary | all | minor | 5 |
| Description (>= 40 words) | all | blocker | 30 |
| No placeholders (TBD / TODO / ???) | all | major | 10 |
| Priority | all | minor | 5 |
| Acceptance criteria | Story, Task | blocker | 30 |
| User story form | Story | minor | 5 |
| Estimate | Story | minor | 5 |
| Steps to reproduce | Bug | blocker | 30 |
| Expected vs actual | Bug | major | 15 |
| Environment / version | Bug | major | 10 |
| Evidence | Bug | minor | 5 |
| Goal and scope | Epic | major | 20 |

Score = 100 minus the weights of failed rules. READY needs score >= threshold (default 80) and no failed blocker.

## Agent actions

`check-issue-readiness`, `get-dor-policy`, `apply-issue-sections`, `post-readiness-comment`. All Jira calls use `api.asUser()`, so Jira's own permissions apply.

## Develop

```bash
npm install
npm test                       # Jest: checker, policy, ADF helpers
forge lint
forge deploy -e development
forge install -e development   # first time; use --upgrade after scope changes
```

Code layout: `src/lib/` pure logic (`checker.js`, `policy.js`, `adf.js`) and thin Forge wrappers (`jira.js`, `store.js`); `src/index.js` action handlers; `src/resolvers.js` + `src/frontend/panel.jsx` the issue panel; `static/prompts/agent.md` the agent prompt.

## Seed demo data

`tools/seed_demo.py PLAT` creates six issues (good and bad on purpose) labelled `readygate-demo`.
