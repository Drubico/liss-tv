/**
 * Filelions / Vidhide cyberlocker stream extractor.
 */

import { unpackPackedJs } from "./streamwish";

export function extractM3u8FromFilelions(html: string): string | null {
  if (!html) return null;

  if (html.includes("p,a,c,k,e,d")) {
    const unpacked = unpackPackedJs(html);
    const m3u8Match = unpacked.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
    if (m3u8Match) {
      return m3u8Match[0];
    }
  }

  const directMatch = html.match(/(?:file|source|src)\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
  if (directMatch) {
    return directMatch[1];
  }

  const anyM3u8 = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
  return anyM3u8 ? anyM3u8[0] : null;
}
