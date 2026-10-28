const { checkIssue } = require('../src/lib/checker');
const { adfToText, textToAdfBlocks, appendToAdf } = require('../src/lib/adf');
const { validatePolicy, mergePolicy } = require('../src/lib/policy');

// Small ADF builders so fixtures stay readable.
const p = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const h = (t, level = 3) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: t }] });
const ol = (...items) => ({ type: 'orderedList', content: items.map((t) => ({ type: 'listItem', content: [p(t)] })) });
const ul = (...items) => ({ type: 'bulletList', content: items.map((t) => ({ type: 'listItem', content: [p(t)] })) });
const doc = (...c) => ({ type: 'doc', version: 1, content: c });

const LONG = 'Customers on the checkout page cannot complete the payment when the basket contains a discounted item, which blocks revenue and creates support tickets every single day for the whole team.';

const ids = (r) => r.missing.map((m) => m.id);

describe('checker fixtures', () => {
  test('1 ready story', () => {
    const r = checkIssue({
      key: 'D-1', summary: 'Show order history on profile page', issueType: 'Story', priority: 'High',
      description: doc(p(`As a customer I want to see my past orders so that I can reorder quickly. ${LONG}`),
        h('Acceptance Criteria'), ul('Given I am logged in', 'When I open the profile', 'Then I see my last 10 orders')),
      customFields: { storyPoints: 3 },
    });
    expect(r.status).toBe('READY');
    expect(r.score).toBe(100);
  });

  test('2 story without acceptance criteria', () => {
    const r = checkIssue({
      key: 'D-2', summary: 'Show order history on profile page', issueType: 'Story', priority: 'High',
      description: doc(p(`As a customer I want to see my past orders so that I can reorder quickly. ${LONG}`)),
      customFields: { storyPoints: 3 },
    });
    expect(ids(r)).toEqual(['acceptance-criteria']);
    expect(r.score).toBe(70);
    expect(r.status).toBe('NEEDS_INFO');
  });

  test('3 bug without steps', () => {
    const r = checkIssue({
      key: 'D-3', summary: 'Login button does nothing', issueType: 'Bug', priority: 'High',
      description: doc(p('The login button does not react when clicked.')),
    });
    expect(ids(r)).toEqual(expect.arrayContaining(['description-present', 'repro-steps', 'expected-actual', 'environment', 'evidence']));
    expect(r.status).toBe('NEEDS_INFO');
    expect(r.score).toBeLessThan(40);
  });

  test('4 complete bug', () => {
    const r = checkIssue({
      key: 'D-4', summary: 'Login button does nothing on Safari', issueType: 'Bug', priority: 'High',
      description: doc(p(LONG), h('Steps to reproduce'), ol('Open the login page', 'Click Login'),
        h('Expected Result'), p('The dashboard opens.'), h('Actual Result'), p('Nothing happens.'),
        h('Environment'), p('Safari 17, macOS 14')),
      attachments: ['screen.png'],
    });
    expect(r.status).toBe('READY');
    expect(r.score).toBe(100);
  });

  test('5 epic with goal and scope', () => {
    const r = checkIssue({
      key: 'D-5', summary: 'Self-service returns for customers', issueType: 'Epic', priority: 'Medium',
      description: doc(p(`Goal: cut support load. In scope: returns form, label printing. Out of scope: refunds. ${LONG}`)),
    });
    expect(ids(r)).not.toContain('epic-goal-and-scope');
    expect(r.status).toBe('READY');
  });

  test('6 task with TBD placeholder', () => {
    const r = checkIssue({
      key: 'D-6', summary: 'Update the shipping rates table', issueType: 'Task', priority: 'Low',
      description: doc(p(`${LONG} Acceptance criteria: TBD`)),
    });
    expect(ids(r)).toContain('no-placeholders');
  });

  test('7 custom acceptance criteria field', () => {
    const r = checkIssue({
      key: 'D-7', summary: 'Export invoices as CSV file', issueType: 'Task', priority: 'Low',
      description: doc(p(LONG)),
      customFields: { acceptanceCriteria: doc(p('CSV has one row per invoice')) },
    });
    expect(ids(r)).not.toContain('acceptance-criteria');
  });

  test('8 non-English text does not crash and counts words', () => {
    const r = checkIssue({
      key: 'D-8', summary: 'Hiển thị lịch sử đơn hàng', issueType: 'Task', priority: 'Low',
      description: doc(p('Khách hàng cần xem lại các đơn hàng đã đặt để mua lại nhanh hơn. '.repeat(5))),
    });
    expect(ids(r)).not.toContain('description-present');
    expect(typeof r.score).toBe('number');
  });
});

describe('policy', () => {
  const bug = { key: 'D-9', summary: 'Login button does nothing', issueType: 'Bug', priority: 'High', description: doc(p('short')) };

  test('disabling a rule raises the score', () => {
    const base = checkIssue(bug).score;
    const off = checkIssue(bug, { rules: { evidence: { enabled: false } } }).score;
    expect(off).toBe(base + 5);
  });

  test('custom rule is evaluated', () => {
    const r = checkIssue(bug, { customRules: [{ id: 'rollback', label: 'Rollback plan', severity: 'major', weight: 10, regexAny: ['rollback'] }] });
    expect(ids(r)).toContain('rollback');
  });

  test('validatePolicy rejects bad input', () => {
    expect(validatePolicy({ threshold: 500 }).ok).toBe(false);
    expect(validatePolicy({ rules: { x: { severity: 'huge' } } }).ok).toBe(false);
    expect(validatePolicy({ customRules: [{ id: 'a', label: 'b', regexAny: ['('] }] }).ok).toBe(false);
    expect(validatePolicy({ threshold: 70 }).policy.threshold).toBe(70);
    expect(mergePolicy(null).threshold).toBe(80);
  });
});

describe('adf helpers', () => {
  test('adfToText keeps headings and lists', () => {
    expect(adfToText(doc(h('Steps to reproduce'), ol('a', 'b'), ul('x')))).toBe('### Steps to reproduce\n1. a\n2. b\n- x');
  });

  test('textToAdfBlocks + appendToAdf round trip', () => {
    const blocks = textToAdfBlocks('Acceptance Criteria', '- Given A\n- When B\n- Then C');
    const merged = appendToAdf(doc(p('old')), blocks);
    const text = adfToText(merged);
    expect(text).toContain('old');
    expect(text).toContain('### Acceptance Criteria');
    expect(text).toContain('- Then C');
  });
});
