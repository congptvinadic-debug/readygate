// Thin Jira REST wrappers for ReadyGate. Every call goes through api.asUser(), so
// Jira itself enforces the permissions of the person talking to the agent.

import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import { adfToText } from './adf';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Throw a readable error when a Jira response is not 2xx. */
async function ensureOk(response, what) {
  if (response.ok) return;
  let detail = '';
  try { detail = (await response.text()).slice(0, 300); } catch (e) { /* ignore */ }
  const err = new Error(`${what} failed (HTTP ${response.status}). ${detail}`.trim());
  err.status = response.status;
  throw err;
}

/**
 * Find the ids of the custom fields the checker cares about (acceptance criteria, story points).
 * Cached in Forge storage for one day because /field returns every field on the site.
 */
export async function getFieldMap(cloudId) {
  const key = `fieldmap:${cloudId || 'site'}`;
  const cached = await kvs.get(key);
  if (cached && Date.now() - cached.at < ONE_DAY_MS) return cached.map;

  const res = await api.asUser().requestJira(route`/rest/api/3/field`);
  await ensureOk(res, 'Reading Jira fields');
  const fields = await res.json();
  const find = (re) => {
    const f = fields.find((x) => x.custom && re.test(x.name));
    return f ? f.id : null;
  };
  const map = {
    acceptanceCriteria: find(/^acceptance criteri(a|on)$/i),
    storyPoints: find(/^story points?( estimate)?$/i),
  };
  await kvs.set(key, { at: Date.now(), map });
  return map;
}

/** Load one issue and normalize it into the shape src/lib/checker.js expects. */
export async function loadIssue(issueKey, cloudId) {
  const map = await getFieldMap(cloudId);
  const wanted = ['summary', 'description', 'issuetype', 'priority', 'labels', 'versions', 'fixVersions', 'attachment', 'comment', 'project']
    .concat(Object.values(map).filter(Boolean));
  const res = await api.asUser().requestJira(
    route`/rest/api/3/issue/${issueKey}?fields=${wanted.join(',')}`,
  );
  await ensureOk(res, `Reading ${issueKey}`);
  const data = await res.json();
  const f = data.fields || {};
  const issueType = f.issuetype ? f.issuetype.name : '';

  // Epics count as having scope when they already have child issues.
  let childCount = 0;
  if (/^epic$/i.test(issueType)) {
    const kids = await api.asUser().requestJira(
      route`/rest/api/3/search/jql?jql=${`parent = ${data.key}`}&maxResults=1&fields=key`,
    );
    if (kids.ok) childCount = ((await kids.json()).issues || []).length;
  }

  return {
    id: data.id,
    key: data.key,
    projectKey: f.project ? f.project.key : data.key.split('-')[0],
    summary: f.summary || '',
    description: f.description || null,
    issueType,
    priority: f.priority ? f.priority.name : null,
    labels: f.labels || [],
    versions: f.versions || [],
    attachments: (f.attachment || []).map((a) => a.filename),
    comments: ((f.comment && f.comment.comments) || []).slice(-5).map((c) => adfToText(c.body).slice(0, 500)),
    childCount,
    customFields: {
      acceptanceCriteria: map.acceptanceCriteria ? f[map.acceptanceCriteria] : null,
      storyPoints: map.storyPoints ? f[map.storyPoints] : null,
    },
    fieldMap: map,
    rawDescription: f.description || null,
  };
}

/** PUT an issue update ({ fields, update }). */
export async function updateIssue(issueKey, body) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  await ensureOk(res, `Updating ${issueKey}`);
}

/** Add a comment (ADF body) to an issue; returns the comment id. */
export async function addComment(issueKey, adfBody) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ body: adfBody }),
  });
  await ensureOk(res, `Commenting on ${issueKey}`);
  return (await res.json()).id;
}
