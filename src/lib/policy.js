// Definition-of-Ready policy: defaults, merge with a stored policy, validation.
// Pure functions: the Forge storage calls live in src/lib/store.js.

const DEFAULT_POLICY = {
  version: 1,
  threshold: 80,
  commentOnCreate: true,
  labelUnready: 'needs-info',
  // Per-rule overrides. Anything omitted falls back to the rule's built-in default.
  rules: {},
  // Simple user-defined rules: { id, label, appliesTo, severity, weight, regexAny:[...] }
  customRules: [],
};

const SEVERITIES = ['blocker', 'major', 'minor'];

/** Merge a stored (possibly partial) policy over the defaults. */
function mergePolicy(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  return {
    version: Number.isInteger(s.version) ? s.version : DEFAULT_POLICY.version,
    threshold: typeof s.threshold === 'number' ? s.threshold : DEFAULT_POLICY.threshold,
    commentOnCreate: typeof s.commentOnCreate === 'boolean' ? s.commentOnCreate : DEFAULT_POLICY.commentOnCreate,
    labelUnready: typeof s.labelUnready === 'string' ? s.labelUnready : DEFAULT_POLICY.labelUnready,
    rules: s.rules && typeof s.rules === 'object' ? s.rules : {},
    customRules: Array.isArray(s.customRules) ? s.customRules : [],
  };
}

/**
 * Validate a policy object. Returns { ok: true, policy } or { ok: false, errors: [...] }.
 * Used by set-dor-policy before anything is written to storage.
 */
function validatePolicy(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Policy must be a JSON object.'] };
  }
  if (input.threshold != null && !(typeof input.threshold === 'number' && input.threshold >= 0 && input.threshold <= 100)) {
    errors.push('threshold must be a number between 0 and 100.');
  }
  if (input.rules != null) {
    if (typeof input.rules !== 'object' || Array.isArray(input.rules)) {
      errors.push('rules must be an object keyed by rule id.');
    } else {
      Object.entries(input.rules).forEach(([id, r]) => {
        if (!r || typeof r !== 'object') { errors.push(`rules.${id} must be an object.`); return; }
        if (r.enabled != null && typeof r.enabled !== 'boolean') errors.push(`rules.${id}.enabled must be true/false.`);
        if (r.severity != null && !SEVERITIES.includes(r.severity)) errors.push(`rules.${id}.severity must be one of ${SEVERITIES.join(', ')}.`);
        if (r.weight != null && !(typeof r.weight === 'number' && r.weight >= 0 && r.weight <= 100)) errors.push(`rules.${id}.weight must be 0-100.`);
      });
    }
  }
  if (input.customRules != null) {
    if (!Array.isArray(input.customRules)) {
      errors.push('customRules must be an array.');
    } else {
      input.customRules.forEach((r, i) => {
        if (!r || typeof r.id !== 'string' || typeof r.label !== 'string') { errors.push(`customRules[${i}] needs string id and label.`); return; }
        if (!Array.isArray(r.regexAny) || r.regexAny.length === 0) { errors.push(`customRules[${i}].regexAny must be a non-empty array.`); return; }
        r.regexAny.forEach((src) => {
          try { new RegExp(src, 'i'); } catch (e) { errors.push(`customRules[${i}] has an invalid regex: ${src}`); }
        });
      });
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, policy: mergePolicy(input) };
}

module.exports = { DEFAULT_POLICY, SEVERITIES, mergePolicy, validatePolicy };
