// RC0 files look like XML but use tag names such as <0> and <#>, and put
// <count> after the root element. A DOM parser rejects them, so this is a
// tokenizer that records the offset of every value for in-place edits.

const token_re = /<([^\/?>\s][^>\s]*)((?:\s[^>]*)?)>([^<]*)<\/\1>|<([^\/?>\s][^>\s]*)((?:\s[^>]*)?)>|<\/([^>\s]+)>|<\?[^>]*\?>/g;

function attrs_parse(text) {
  const attrs = {};
  for (const m of text.matchAll(/([\w:-]+)="([^"]*)"/g))
    attrs[m[1]] = m[2];
  return attrs;
}

export function rc0_parse(text) {
  const doc = { root: null, sections: [], count: null, count_start: -1, count_end: -1 };
  const stack = [];
  let section = null;

  for (const m of text.matchAll(token_re)) {
    if (m[1] !== undefined) {
      const value_start = m.index + m[0].indexOf('>') + 1;
      const value_end = value_start + m[3].length;
      if (stack.length === 0) {
        if (m[1] !== 'count')
          throw new Error(`unexpected top-level element <${m[1]}> at ${m.index}`);
        doc.count = parseInt(m[3], 16);
        doc.count_start = value_start;
        doc.count_end = value_end;
        continue;
      }
      if (!section)
        throw new Error(`value <${m[1]}> outside a section at ${m.index}`);
      section.fields.push({ tag: m[1], value: m[3], start: value_start, end: value_end });
      continue;
    }

    if (m[4] !== undefined) {
      const element = { name: m[4], attrs: attrs_parse(m[5]) };
      if (stack.length === 0)
        doc.root = element;
      stack.push(element);
      if (stack.length >= 3) {
        const path = stack.slice(1).map(e => e.name).join('/');
        section = { name: m[4], attrs: element.attrs, path, parent: stack[1].name, fields: [] };
        doc.sections.push(section);
      }
      continue;
    }

    if (m[6] !== undefined) {
      const element = stack.pop();
      if (!element || element.name !== m[6])
        throw new Error(`unbalanced </${m[6]}> at ${m.index}`);
      section = null;
    }
  }

  if (stack.length)
    throw new Error(`unclosed <${stack[stack.length - 1].name}>`);
  if (doc.count === null)
    throw new Error('no <count> element');
  return doc;
}

export function rc0_section_get(doc, path) {
  return doc.sections.find(s => s.path === path) || null;
}

export function rc0_field_get(section, tag) {
  return section?.fields.find(f => f.tag === tag) || null;
}
