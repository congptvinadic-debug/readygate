// Deterministic Definition-of-Ready checker. Pure: no Forge imports, no network.
// Input: a normalized issue + a policy. Output: score, status and the list of gaps.

const { adfToText } = require('./adf');
const { mergePolicy } = require('./policy');

const ALL = ['*'];

// Built-in rules. `detect(ctx)` returns true when the issue PASSES the rule.
// ctx = { issue, text, lines, wordCount }
const RULES = [
  {
    id: 'summary-length', label: 'Clear summary', appliesTo: ALL, severity: 'minor', weight: 5,
    hint: 'Use a summary of at least 15 characters that is not all caps or cut off with "...".',
    detect: ({ issue }) => {
      const s = (issue.summary || '').trim();
      return s.length >= 15 && !/\.\.\.$/.test(s) && s !== s.toUpperCase();
    },
  },
  {
    id: 'description-present', label: 'Description', appliesTo: ALL, severity: 'blocker', weight: 30,
    hint: 'Describe the work in at least 40 words: context, goal and scope.',
    detect: ({ wordCount }) => wordCount >= 40,
  },
  {
    id: 'no-placeholders', label: 'No placeholders', appliesTo: ALL, severity: 'major', weight: 10,
    hint: 'Replace TBD / TODO / ??? / lorem text with real content.',
    detect: ({ text, issue }) => !/\b(tbd|todo|lorem ipsum)\b|\?\?\?/i.test(`${issue.summary || ''}\n${text}`),
  },
  {
    id: 'priority-set', label: 'Priority', appliesTo: ALL, severity: 'minor', weight: 5,
    hint: 'Set a priority.',
    detect: ({ issue }) => !!issue.priority,
  },
  {
    id: 'acceptance-criteria', label: 'Acceptance criteria', appliesTo: ['Story', 'Task'], severity: 'blocker', weight: 30,
    hint: 'Add acceptance criteria, e.g. 3-6 "Given / When / Then" bullets.',
    detect: ({ issue, text, lines }) => {
      if (issue.customFields && hasValue(issue.customFields.acceptanceCriteria)) return true;
      if (/acceptance criteria|^#+\s*ac\b|\bAC:/im.test(text)) return true;
      if (lines.filter((l) => /^(-\s*)?(given|when|then)\b/i.test(l)).length >= 2) return true;
      return lines.filter((l) => /^\[[ x]\]/i.test(l)).length >= 3;
    },
  },
  {
    id: 'user-story-form', label: 'User story form', appliesTo: ['Story'], severity: 'minor', weight: 5,
    hint: 'Write it as "As a <user> I want <goal> so that <benefit>".',
    detect: ({ text, issue }) => /as an? .+ i want .+ so that/is.test(`${issue.summary || ''} ${text}`),
  },
  {
    id: 'estimate-set', label: 'Estimate', appliesTo: ['Story'], severity: 'minor', weight: 5,
    hint: 'Add a story point estimate.',
    detect: ({ issue }) => !!(issue.customFields && hasValue(issue.customFields.storyPoints)),
  },
  {
    id: 'repro-steps', label: 'Steps to reproduce', appliesTo: ['Bug'], severity: 'blocker', weight: 30,
    hint: 'Add a "Steps to reproduce" heading followed by a numbered list of at least 2 steps.',
    detect: ({ text, lines }) => {
      const idx = lines.findIndex((l) => /steps to reproduce|repro/i.test(l));
      if (idx < 0) return false;
      // Count numbered items after the heading line.
      let n = 0;
      for (let i = idx; i < lines.length; i += 1) if (/^\d+[.)]\s+/.test(lines[i])) n += 1;
      return n >= 2;
    },
  },
  {
    id: 'expected-actual', label: 'Expected vs actual result', appliesTo: ['Bug'], severity: 'major', weight: 15,
    hint: 'State the expected result and the actual result.',
    detect: ({ text }) => /expected/i.test(text) && /actual|observed/i.test(text),
  },
  {
    id: 'environment', label: 'Environment / version', appliesTo: ['Bug'], severity: 'major', weight: 10,
    hint: 'Add the environment: browser or OS, device, app version.',
    detect: ({ issue, text }) => /environment|version|browser|\bos\b|device/i.test(text) || (issue.versions || []).length > 0,
  },
  {
    id: 'evidence', label: 'Evidence (screenshot, log or link)', appliesTo: ['Bug'], severity: 'minor', weight: 5,
    hint: 'Attach a screenshot or log, or link to one.',
    detect: ({ issue, text }) => (issue.attachments || []).length >= 1 || /https?:\/\//i.test(text),
  },
  {
    id: 'epic-goal-and-scope', label: 'Goal and scope', appliesTo: ['Epic'], severity: 'major', weight: 20,
    hint: 'State the goal/outcome and what is in and out of scope.',
    detect: ({ issue, text }) => (/goal|outcome/i.test(text) && /scope|in scope|out of scope/i.test(text)) || (issue.childCount || 0) >= 1,
  },
];

function hasValue(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return true;
  if (typeof v === 'object') return adfToText(v).trim().length > 0;
  return false;
}

function appliesTo(rule, issueType) {
  const types = rule.appliesTo || ALL;
  return types.includes('*') || types.map((t) => t.toLowerCase()).includes(String(issueType || '').toLowerCase());
}

/** Build the effective rule list: built-ins with policy overrides, plus custom rules. */
function effectiveRules(policy) {
  const p = mergePolicy(policy);
  const rules = RULES.map((r) => {
    const o = p.rules[r.id] || {};
    return {
      ...r,
      enabled: o.enabled !== false,
      severity: o.severity || r.severity,
      weight: typeof o.weight === 'number' ? o.weight : r.weight,
      appliesTo: Array.isArray(o.appliesTo) ? o.appliesTo : r.appliesTo,
    };
  });
  p.customRules.forEach((c) => {
    const patterns = (c.regexAny || []).map((src) => new RegExp(src, 'i'));
    rules.push({
      id: c.id, label: c.label, hint: c.hint || `Add: ${c.label}.`,
      appliesTo: c.appliesTo || ALL, severity: c.severity || 'minor',
      weight: typeof c.weight === 'number' ? c.weight : 5,
      enabled: c.enabled !== false,
      detect: ({ text, issue }) => patterns.some((re) => re.test(`${issue.summary || ''}\n${text}`)),
    });
  });
  return { policy: p, rules };
}

/**
 * Check one normalized issue.
 * issue = { key, summary, description (ADF|string), issueType, priority, labels[], attachments[],
 *           comments[], versions[], childCount, customFields:{acceptanceCriteria, storyPoints} }
 */
function checkIssue(issue, policyInput) {
  const { policy, rules } = effectiveRules(policyInput);
  const text = adfToText(issue.description);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const ctx = { issue, text, lines, wordCount: (text.match(/\S+/g) || []).length };

  const missing = [];
  const present = [];
  let lost = 0;
  rules.filter((r) => r.enabled && appliesTo(r, issue.issueType)).forEach((r) => {
    if (r.detect(ctx)) {
      present.push(r.id);
    } else {
      lost += r.weight;
      missing.push({ id: r.id, label: r.label, severity: r.severity, hint: r.hint });
    }
  });

  const score = Math.max(0, 100 - lost);
  const hasBlocker = missing.some((m) => m.severity === 'blocker');
  return {
    issueKey: issue.key,
    issueType: issue.issueType,
    score,
    status: score >= policy.threshold && !hasBlocker ? 'READY' : 'NEEDS_INFO',
    missing,
    present,
    summary: issue.summary,
    descriptionText: text,
    comments: issue.comments || [],
    attachments: issue.attachments || [],
    policyVersion: policy.version,
  };
}

module.exports = { RULES, checkIssue, effectiveRules };
