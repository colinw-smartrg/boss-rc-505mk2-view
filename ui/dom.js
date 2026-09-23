export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false)
      continue;
    if (k.startsWith('on') && typeof v === 'function')
      el.addEventListener(k.slice(2), v);
    else if (k === 'class')
      el.className = v;
    else if (k in el && typeof v !== 'string')
      el[k] = v;
    else
      el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false)
      continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el, ...children) {
  el.replaceChildren();
  for (const c of children.flat(Infinity))
    if (c)
      el.append(c);
  return el;
}
