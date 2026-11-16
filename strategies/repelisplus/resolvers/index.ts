import { extractM3u8FromStreamwish } from "./streamwish";
import { extractM3u8FromVoe } from "./voe";
import { extractM3u8FromFilelions } from "./filelions";

export type HtmlFetcher = (url: string) => Promise<string>;

export async function resolveCyberlockerStream(
  embedUrl: string,
  fetcher: HtmlFetcher,
): Promise<string | null> {
  if (!embedUrl || !embedUrl.startsWith("http")) return null;

  try {
    const html = await fetcher(embedUrl);
    if (!html) return null;

    const lower = embedUrl.toLowerCase();

    if (lower.includes("streamwish") || lower.includes("wishembed") || lower.includes("strmwish")) {
      const stream = extractM3u8FromStreamwish(html);
      if (stream) return stream;
    }

    if (lower.includes("voe") || lower.includes("delivery")) {
      const stream = extractM3u8FromVoe(html);
      if (stream) return stream;
    }

    if (lower.includes("filelions") || lower.includes("vidhide") || lower.includes("lion")) {
      const stream = extractM3u8FromFilelions(html);
      if (stream) return stream;
    }

    // Generic fallback across all extractors
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
