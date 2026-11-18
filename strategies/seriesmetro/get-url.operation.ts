import * as cheerio from "cheerio";
import type { GetUrlOptions, StrategyGetUrl, Url } from "@/types/movie";
import { seriesmetroFetch, SeriesmetroError } from "./client";
import { extractFastreamM3u8 } from "./extractors/fastream.extractor";

export class GetUrl implements StrategyGetUrl {
  private readonly fetchFn: typeof fetch;
  private readonly extractFn: typeof extractFastreamM3u8;

  constructor(
    fetchFn: typeof fetch = seriesmetroFetch as typeof fetch,
    extractFn: typeof extractFastreamM3u8 = extractFastreamM3u8
  ) {
    this.fetchFn = fetchFn;
    this.extractFn = extractFn;
  }

  async operation(path: string, options?: GetUrlOptions): Promise<Url> {
    const targetPath = await this.resolveContentPath(path, options);

    const res = await this.fetchFn(targetPath);
    const html = await res.text();
    const $ = cheerio.load(html);

    // 1. Collect all embed options with language and trembed URL
    interface EmbedCandidate {
      index: number;
      language: string;
      trembedUrl: string;
    }

    const candidates: EmbedCandidate[] = [];

    $("aside.video-options ul.aa-tbs-video li a, ul.aa-tbs-video li a").each((i, el) => {
      const $a = $(el);
      const href = $a.attr("href") || `#options-${i}`;
      const targetId = href.replace(/^#/, "");
      const serverLabel = $a.find(".server").text().replace(/^-/, "").trim() || "Latino";

      const iframeEl = $(`#${targetId} iframe`);
      const rawSrc =
        iframeEl.attr("data-src") ||
        iframeEl.attr("src") ||
        "";

      if (rawSrc) {
        candidates.push({
          index: i,
          language: serverLabel,
          trembedUrl: rawSrc,
        });
      }
    });

    // Fallback: direct iframes with trembed in page
    if (candidates.length === 0) {
      $("iframe[src*='trembed'], iframe[data-src*='trembed']").each((i, ifr) => {
        const src = $(ifr).attr("data-src") || $(ifr).attr("src") || "";
        if (src) {
          candidates.push({
            index: i,
            language: "Latino",
            trembedUrl: src,
          });
        }
      });
    }

    if (candidates.length === 0) {
      throw new SeriesmetroError(
        `[SeriesMetro] No player embed options found for ${path}`
      );
    }

    // 2. Language prioritization
    const preferredLang = (
      options?.language ||
      (options?.params?.lang as string | undefined) ||
      "LAT"
    ).toUpperCase();

    const prioritized = [...candidates].sort((a, b) => {
      const aMatches = a.language.toUpperCase().includes(preferredLang);
      const bMatches = b.language.toUpperCase().includes(preferredLang);
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return a.index - b.index;
    });

    // 3. Resolve playable streams
    const resolvedStreams: Array<{ m3u8Url: string; hosterReferer: string }> = [];

    for (const cand of prioritized) {
      try {
        const cleanTrembedUrl = cand.trembedUrl.replace(/&#038;/g, "&");
        const trembedRes = await this.fetchFn(cleanTrembedUrl, {
          headers: {
            Referer: targetPath.startsWith("http")
              ? targetPath
              : `https://www3.seriesmetro.net${targetPath.startsWith("/") ? "" : "/"}${targetPath}`,
          },
        });

        if (!trembedRes.ok) continue;

        const trembedHtml = await trembedRes.text();
        const hosterMatch = trembedHtml.match(/<iframe[^>]+src="([^"]+)"/i);
        if (!hosterMatch) continue;

        const hosterUrl = hosterMatch[1];
        let m3u8Url: string | null = null;
        let hosterReferer = "https://fastream.to/";

        if (hosterUrl.includes("fastream.to")) {
          m3u8Url = await this.extractFn(hosterUrl, this.fetchFn);
          hosterReferer = "https://fastream.to/";
        }

        if (m3u8Url) {
          resolvedStreams.push({ m3u8Url, hosterReferer });
          if (resolvedStreams.length >= 2) break;
        }
      } catch {
        // Try next candidate
      }
    }

    if (resolvedStreams.length === 0) {
      throw new SeriesmetroError(
        `[SeriesMetro] Could not extract any playable HLS stream for ${path}`
      );
    }

    const primary = resolvedStreams[0];
    const secondary = resolvedStreams[1];

    return {
      url: primary.m3u8Url,
      fallbackUrl: secondary?.m3u8Url,
      directSegments: true,
      headers: {
        Referer: primary.hosterReferer,
      },
    };
  }

  private async resolveContentPath(path: string, options?: GetUrlOptions): Promise<string> {
    // If it's already a direct movie or episode endpoint
    if (path.includes("/capitulo/") || path.includes("/pelicula/")) {
      return path;
    }

    // Series episode coordinates check
    const season =
      options?.season ??
      options?.detailContext?.season ??
      options?.params?.season;
    const episode =
      options?.episode ??
      options?.detailContext?.episode ??
      options?.params?.episode;

    if (season !== undefined && episode !== undefined) {
      const cleanSlug = path
        .replace(/^\/?serie\//, "")
        .replace(/#.*$/, "")
        .replace(/\/+$/, "");

      // If episodes were pre-parsed in detailContext
      const detailContext = options?.detailContext as
        | { episodes?: Array<{ season: number; episodes: Array<{ numberEpisode: string; link: string }> }> }
        | undefined;

      const seasonGroup = detailContext?.episodes?.find((s) => s.season === Number(season));
      const foundEp = seasonGroup?.episodes?.find(
        (e) => String(e.numberEpisode) === String(episode)
      );

      if (foundEp?.link) {
        return foundEp.link;
      }

      // Fallback: fetch series page to find episode link
      const seriesPageRes = await this.fetchFn(`/serie/${cleanSlug}/`);
      const seriesHtml = await seriesPageRes.text();
      const $ = cheerio.load(seriesHtml);

      let foundHref = "";
      $("a[href*='/capitulo/']").each((_, el) => {
        const href = $(el).attr("href") || "";
        const match = href.match(/temporada-(\d+)-capitulo-(\d+)/i);
        if (
          match &&
          Number(match[1]) === Number(season) &&
          Number(match[2]) === Number(episode)
        ) {
          foundHref = href;
          return false;
        }
      });

      if (foundHref) {
        return foundHref;
      }

      // Speculative fallback format
      return `/capitulo/${cleanSlug}-temporada-${season}-capitulo-${episode}/`;
    }

    return path;
  }
}
