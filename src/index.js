// Forge action handlers for the ReadyGate Rovo agent.
// Each handler receives the inputs declared in manifest.yml plus a `context` object
// (cloudId, jira.issueKey when the agent is opened on an issue, accountId).
// Handlers return plain JSON; errors are returned as { error, hint } so the agent can
// explain them instead of failing silently.

import { checkIssue } from './lib/checker';
import { textToAdfBlocks, appendToAdf, adfDoc } from './lib/adf';
import { loadIssue, updateIssue, addComment } from './lib/jira';
import { loadPolicy } from './lib/store';

// Resolver for the issue panel lives in resolvers.js; re-exported so the manifest can reach it.
export { panelHandler } from './resolvers';

// Prefer the key the model passed; fall back to the issue the chat was opened on.
function resolveIssueKey(payload) {
  const key = (payload && payload.issueKey) || (payload && payload.context && payload.context.jira && payload.context.jira.issueKey);
  return key ? String(key).trim().toUpperCase() : null;
}

function fail(e, hint) {
  console.error(`ReadyGate error: ${e && e.message}`);
  return { error: (e && e.message) || 'Unknown error', hint: hint || 'Check that the issue key exists and you can view it.' };
}

async function runCheck(issueKey, cloudId) {
  const issue = await loadIssue(issueKey, cloudId);
  const policy = await loadPolicy(issue.projectKey);
  return { issue, report: checkIssue(issue, policy) };
}

/** Action check-issue-readiness: score + missing items for one issue. */
export async function checkIssueReadiness(payload) {
  try {
    const key = resolveIssueKey(payload);
    if (!key) return { error: 'No issue key.', hint: 'Ask the user for the issue key, e.g. DEMO-3.' };
    const { report } = await runCheck(key, payload.context && payload.context.cloudId);
    return report;
  } catch (e) {
    return fail(e);
  }
}

/** Action get-dor-policy: the effective Definition-of-Ready policy of a project. */
export async function getDorPolicy(payload) {
  try {
    const projectKey = payload.projectKey || (payload.context && payload.context.jira && payload.context.jira.issueKey || '').split('-')[0];
    if (!projectKey) return { error: 'No project key.', hint: 'Ask the user for the project key.' };
    return { projectKey: String(projectKey).toUpperCase(), policy: await loadPolicy(projectKey) };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Action apply-issue-sections: append the drafted sections to the description
 * (and the custom Acceptance Criteria field when the site has one), then re-check.
 * The prompt makes the agent show the text and get a "yes" before calling this.
 */
export async function applyIssueSections(payload) {
  try {
    const key = resolveIssueKey(payload);
    if (!key) return { error: 'No issue key.', hint: 'Ask the user for the issue key.' };

    const sections = [
      ['Acceptance Criteria', payload.acceptanceCriteria],
      ['Steps to Reproduce', payload.stepsToReproduce],
      ['Expected Result', payload.expectedResult],
      ['Actual Result', payload.actualResult],
      ['Environment', payload.environment],
    ].filter(([, text]) => text && String(text).trim());
    const labels = String(payload.labelsToAdd || '').split(',').map((l) => l.trim()).filter(Boolean);
    if (!sections.length && !labels.length) {
      return { error: 'Nothing to apply.', hint: 'Provide at least one section or label.' };
    }

    const cloudId = payload.context && payload.context.cloudId;
    const issue = await loadIssue(key, cloudId);
    const fields = {};
    const update = {};
    const changed = [];

    if (sections.length) {
      const blocks = sections.flatMap(([title, text]) => textToAdfBlocks(title, text));
      fields.description = appendToAdf(issue.rawDescription, blocks);
      changed.push(...sections.map(([title]) => title));

      // Sites that have a dedicated Acceptance Criteria field get the text there too.
      const acField = issue.fieldMap.acceptanceCriteria;
      if (acField && payload.acceptanceCriteria && String(payload.acceptanceCriteria).trim()) {
        fields[acField] = adfDoc(textToAdfBlocks(null, payload.acceptanceCriteria));
      }
    }
    if (labels.length) {
      update.labels = labels.map((l) => ({ add: l }));
      changed.push('labels');
    }

    await updateIssue(key, { fields, update });
    const { report } = await runCheck(key, cloudId);
    return { updated: true, fieldsChanged: changed, newScore: report.score, newStatus: report.status, stillMissing: report.missing.map((m) => m.label) };
  } catch (e) {
    return fail(e, 'The issue may be read-only or a field is not on its edit screen. Suggest adding the text manually.');
  }
}

/** Action post-readiness-comment: add a plain-text comment to an issue. */
export async function postReadinessComment(payload) {
  try {
    const key = resolveIssueKey(payload);
    if (!key || !payload.message) return { error: 'Need an issue key and a message.', hint: 'Ask the user for both.' };
    const id = await addComment(key, adfDoc(textToAdfBlocks(null, payload.message)));
    return { commentId: id };
  } catch (e) {
    return fail(e);
  }
}
