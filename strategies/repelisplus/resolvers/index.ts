import { extractM3u8FromStreamwish } from "./streamwish";
import { extractM3u8FromVoe } from "./voe";
import { extractM3u8FromFilelions } from "./filelions";
import { extractM3u8FromNupload } from "./nupload";

export type HtmlFetcher = (url: string) => Promise<string>;

function unwrapIframeUrl(url: string): string {
  if (url.includes("iframe/?url=")) {
    try {
      const parsed = new URL(url);
      const nested = parsed.searchParams.get("url");
      if (nested && nested.startsWith("http")) return nested;
    } catch {
      // Ignore URL parsing errors
    }
  }
  return url;
}

export async function resolveCyberlockerStream(
  rawEmbedUrl: string,
  fetcher: HtmlFetcher,
): Promise<string | null> {
  const embedUrl = unwrapIframeUrl(rawEmbedUrl);
  if (!embedUrl || !embedUrl.startsWith("http")) return null;

  try {
    const html = await fetcher(embedUrl);
    if (!html) return null;

    const lower = embedUrl.toLowerCase();

    // 1. Nupload handler
    if (lower.includes("nupload")) {
      const nupResult = extractM3u8FromNupload(html);
      if (nupResult) {
        if (nupResult.type === "iframe") {
          return resolveCyberlockerStream(nupResult.url, fetcher);
        }
        if (nupResult.type === "stream") {
          try {
            const head = await fetch(nupResult.url, { redirect: "manual" });
            const location = head.headers.get("location");
            if (location && location.startsWith("http")) {
              return location;
            }
          } catch {
            // Ignore manual redirect check failure, fallback to stream URL
          }
          return nupResult.url;
        }
      }
    }

    // 2. Streamwish handler
    if (lower.includes("streamwish") || lower.includes("wishembed") || lower.includes("strmwish")) {
      const stream = extractM3u8FromStreamwish(html);
      if (stream) return stream;
    }

    // 3. Voe handler
    if (lower.includes("voe") || lower.includes("delivery") || lower.includes("arianathank")) {
      const redirectMatch = html.match(/(?:window\.)?location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/i);
      if (redirectMatch && redirectMatch[1] !== embedUrl) {
        return resolveCyberlockerStream(redirectMatch[1], fetcher);
      }
      const stream = extractM3u8FromVoe(html);
      if (stream) return stream;
    }

    // 4. Filelions / Vidhide handler
    if (lower.includes("filelions") || lower.includes("vidhide") || lower.includes("lion")) {
      const stream = extractM3u8FromFilelions(html);
      if (stream) return stream;
    }

    // 5. Generic fallback across all extractors
    return (
      extractM3u8FromStreamwish(html) ||
      extractM3u8FromVoe(html) ||
      extractM3u8FromFilelions(html) ||
      null
    );
  } catch (err) {
    console.warn(`[RepelisPlus] Resolver failed for embed "${embedUrl}":`, err);
    return null;
  }
}
