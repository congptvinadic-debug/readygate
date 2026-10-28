// Resolver for the "Readiness" issue panel. The panel (src/frontend/panel.jsx) calls
// invoke('getReport') and shows the same result the agent gets from check-issue-readiness.

import Resolver from '@forge/resolver';
import { checkIssue } from './lib/checker';
import { loadIssue } from './lib/jira';
import { loadPolicy } from './lib/store';

const resolver = new Resolver();

resolver.define('getReport', async ({ context }) => {
  const key = context.extension && context.extension.issue && context.extension.issue.key;
  if (!key) return { error: 'This panel only works on a Jira issue.' };
  try {
    const issue = await loadIssue(key, context.cloudId);
    const policy = await loadPolicy(issue.projectKey);
    const report = checkIssue(issue, policy);
    // The panel does not need the full text, keep the payload small.
    return { issueKey: report.issueKey, issueType: report.issueType, score: report.score, status: report.status, missing: report.missing, presentCount: report.present.length };
  } catch (e) {
    console.error(`ReadyGate panel error: ${e.message}`);
    return { error: e.message };
  }
});

export const panelHandler = resolver.getDefinitions();
