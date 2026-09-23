// RC0 files are ASCII. A byte-to-code-unit mapping keeps any other byte
// intact, so a parse and write with no edits returns the same bytes.

export function text_from_bytes(bytes) {
  let text = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step)
    text += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return text;
}

export function text_to_bytes(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++)
    bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}
