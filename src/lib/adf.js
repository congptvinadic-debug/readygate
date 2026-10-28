// Helpers for Atlassian Document Format (ADF), the JSON format Jira Cloud uses
// for rich text. Pure functions only: no Forge imports, so Jest can run them.

/**
 * Flatten an ADF document (or a plain string) to plain text, one block per line.
 * Headings become "# Title", bullets "- x", numbered items "1. x",
 * task items "[ ] x" / "[x] x", code blocks keep their text.
 */
function adfToText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  const lines = [];
  walk(node, lines, null);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Collect the text of inline children (text, mentions, emoji, hard breaks).
function inlineText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') return (node.attrs && node.attrs.text) || '@user';
  if (node.type === 'emoji') return (node.attrs && (node.attrs.text || node.attrs.shortName)) || '';
  if (node.type === 'inlineCard') return (node.attrs && node.attrs.url) || '';
  return (node.content || []).map(inlineText).join('');
}

function walk(node, lines, listCtx) {
  switch (node.type) {
    case 'doc':
    case 'blockquote':
    case 'panel':
    case 'expand':
      (node.content || []).forEach((c) => walk(c, lines, listCtx));
      break;
    case 'heading': {
      const level = (node.attrs && node.attrs.level) || 1;
      lines.push(`${'#'.repeat(level)} ${inlineText(node)}`);
      break;
    }
    case 'paragraph':
      lines.push(prefixed(listCtx, inlineText(node)));
      break;
    case 'bulletList':
      (node.content || []).forEach((c) => walk(c, lines, { kind: 'bullet', n: 0 }));
      break;
    case 'orderedList': {
      const ctx = { kind: 'ordered', n: 0 };
      (node.content || []).forEach((c) => { ctx.n += 1; walk(c, lines, ctx); });
      break;
    }
    case 'listItem':
      (node.content || []).forEach((c) => {
        // A list item holds paragraphs and possibly nested lists.
        if (c.type === 'paragraph') lines.push(prefixed(listCtx, inlineText(c)));
        else walk(c, lines, null);
      });
      break;
    case 'taskList':
      (node.content || []).forEach((c) => walk(c, lines, null));
      break;
    case 'taskItem': {
      const done = node.attrs && node.attrs.state === 'DONE';
      lines.push(`${done ? '[x]' : '[ ]'} ${inlineText(node)}`);
      break;
    }
    case 'codeBlock':
      lines.push(inlineText(node));
      break;
    default:
      // Tables, media, etc.: keep any text inside, ignore structure.
      if (node.content) node.content.forEach((c) => walk(c, lines, listCtx));
      else if (node.type === 'text') lines.push(node.text || '');
  }
}

function prefixed(listCtx, text) {
  if (!listCtx) return text;
  return listCtx.kind === 'ordered' ? `${listCtx.n}. ${text}` : `- ${text}`;
}

/**
 * Turn the plain text an agent drafted into ADF blocks under a heading.
 * Lines starting with "- " / "* " become a bullet list, "1. " an ordered list,
 * everything else paragraphs. Returns an array of ADF block nodes.
 */
function textToAdfBlocks(title, text) {
  const blocks = [];
  if (title) {
    blocks.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: title }] });
  }
  let list = null; // { type, items[] } being accumulated
  const flush = () => {
    if (list) { blocks.push({ type: list.type, content: list.items }); list = null; }
  };
  const item = (t) => ({
    type: 'listItem',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
  });
  String(text || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) { flush(); return; }
    let m = line.match(/^[-*•]\s+(.*)$/);
    if (m) {
      if (!list || list.type !== 'bulletList') { flush(); list = { type: 'bulletList', items: [] }; }
      list.items.push(item(m[1]));
      return;
    }
    m = line.match(/^\d+[.)]\s+(.*)$/);
    if (m) {
      if (!list || list.type !== 'orderedList') { flush(); list = { type: 'orderedList', items: [] }; }
      list.items.push(item(m[1]));
      return;
    }
    flush();
    blocks.push({ type: 'paragraph', content: [{ type: 'text', text: line }] });
  });
  flush();
  return blocks;
}

/** Wrap blocks in a full ADF document. */
function adfDoc(blocks) {
  return { type: 'doc', version: 1, content: blocks };
}

/** Append blocks to an existing ADF description (or start a new one). */
function appendToAdf(existing, blocks) {
  const base = existing && existing.type === 'doc' && Array.isArray(existing.content)
    ? existing.content
    : (typeof existing === 'string' && existing.trim()
      ? [{ type: 'paragraph', content: [{ type: 'text', text: existing }] }]
      : []);
  return adfDoc([...base, ...blocks]);
}

module.exports = { adfToText, textToAdfBlocks, adfDoc, appendToAdf };
