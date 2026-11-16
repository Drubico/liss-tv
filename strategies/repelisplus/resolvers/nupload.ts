/**
 * Nupload cyberlocker stream extractor.
 */

export interface NuploadExtractionResult {
  type: "stream" | "iframe";
  url: string;
}

export function extractM3u8FromNupload(html: string): NuploadExtractionResult | null {
  if (!html) return null;

  // 1. Check if the page is an iframe wrapper pointing to another provider
  const iframeMatch = html.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
  if (iframeMatch) {
    return { type: "iframe", url: iframeMatch[1] };
  }

  // 2. Find the forEach call to locate the base64 array variable name and subtraction offset
  const forEachMatch = html.match(
    /([A-Za-z0-9_]+)\.forEach\s*\(\s*function\s*[A-Za-z0-9_]*\s*\(\s*value\s*\)\s*\{[\s\S]*?-\s*(\d+)\s*\)/,
  );
  if (!forEachMatch) return null;

  const arrayVarName = forEachMatch[1];
  const offset = parseInt(forEachMatch[2], 10);

  // 3. Locate array definition for the matched variable name
  const arrayRegex = new RegExp(`var\\s+${arrayVarName}\\s*=\\s*(\\[[^\\]]+\\]);`);
  const arrayMatch = html.match(arrayRegex);
  if (!arrayMatch) return null;

  let base64Array: unknown[];
  try {
    const raw = arrayMatch[1].replace(/'/g, '"');
    base64Array = JSON.parse(raw) as unknown[];
  } catch {
    return null;
  }

  // 4. Reconstruct base URL by reversing the offset cipher
  let baseUrl = "";
  for (const item of base64Array) {
    if (typeof item !== "string") continue;
    try {
      const decoded = Buffer.from(item, "base64").toString("utf-8");
      const digits = decoded.replace(/\D/g, "");
      if (digits) {
        const charCode = parseInt(digits, 10) - offset;
        baseUrl += String.fromCharCode(charCode);
      }
    } catch {
      // Ignore individual character decoding failures
    }
  }

  // 5. Locate session key (sesz)
  const sessionMatch = html.match(/var\s+sesz\s*=\s*["']([^"']+)["']/);
  const session = sessionMatch ? sessionMatch[1] : "";

  if (!baseUrl.startsWith("http") || !session) return null;

  return { type: "stream", url: `${baseUrl}?s=${session}` };
}
