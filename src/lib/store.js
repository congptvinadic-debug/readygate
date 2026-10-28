// Policy storage in Forge Key-Value Store (scope storage:app).
// One policy document per Jira project, key "policy:<PROJECTKEY>".

import { kvs } from '@forge/kvs';
import { mergePolicy } from './policy';

export async function loadPolicy(projectKey) {
  const stored = projectKey ? await kvs.get(`policy:${String(projectKey).toUpperCase()}`) : null;
  return mergePolicy(stored);
}

export async function savePolicy(projectKey, policy) {
  await kvs.set(`policy:${String(projectKey).toUpperCase()}`, policy);
}
