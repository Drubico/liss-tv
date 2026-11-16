/**
 * Streamwish and Streamwish-clone unpacker & direct stream extractor.
 */

export function unpackPackedJs(packed: string): string {
  const match = packed.match(
    /}\s*\(\s*['"](.*?)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"](.*?)['"]\.split\(['"]\|['"]\)/s,
  );
  if (!match) return packed;

  const [, payload, radixStr, , symStr] = match;
  const radix = parseInt(radixStr, 10);
  const syms = symStr.split("|");

  const unbase = (val: string): number => {
    return parseInt(val, radix);
  };

  return payload.replace(/\b([0-9a-zA-Z]+)\b/g, (token) => {
    const idx = unbase(token);
    if (!isNaN(idx) && idx < syms.length && syms[idx]) {
      return syms[idx];
    }
    return token;
  });
}

export function extractM3u8FromStreamwish(html: string): string | null {
  if (!html) return null;

  // 1. Try unpacking packed javascript if present
  if (html.includes("p,a,c,k,e,d")) {
    const unpacked = unpackPackedJs(html);
    const m3u8Match = unpacked.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
    if (m3u8Match) {
      return m3u8Match[0];
    }
  }

  // 2. Direct regex search for m3u8 master playlist in sources
  const directMatch = html.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
  if (directMatch) {
    return directMatch[1];
  }

  const anyM3u8 = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
  return anyM3u8 ? anyM3u8[0] : null;
}
