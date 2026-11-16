/**
 * Voe cyberlocker stream extractor.
 */

export function extractM3u8FromVoe(html: string): string | null {
  if (!html) return null;

  // 1. Check for standard 'hls': '...' or "hls": "..."
  const hlsMatch = html.match(/["']hls["']\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
  if (hlsMatch) {
    return hlsMatch[1];
  }

  // 2. Check for base64 encoded HLS payload
  const b64Match = html.match(/prompt\(["'](aHR0c[a-zA-Z0-9+/=]+)["']\)/);
  if (b64Match) {
    try {
      const decoded = Buffer.from(b64Match[1], "base64").toString("utf-8");
      if (decoded.includes(".m3u8")) {
        return decoded;
      }
    } catch {
      // Ignored decoding failure
    }
  }

  // 3. Fallback direct match for m3u8
  const m3u8 = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
  return m3u8 ? m3u8[0] : null;
}
