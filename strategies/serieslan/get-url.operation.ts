import type { StrategyGetMovieUrl } from "@/strategies/context";
import type { MovieUrlResponse } from "@/types/movie";
import { serieslanFetch, SeriesLanError } from "./client";
import type { SeriesLanContentDetail } from "./types";

const PLAYER_BASE = "https://player.serieslan.live";

export function extractVimeosIframe(html: string): string | null {
  const match = html.match(/<iframe[^>]+src=["']([^"']*vimeos\.net[^"']*)["']/i);
  if (match) return match[1];

  const genericMatch = html.match(/https?:\/\/[^\s"'<>]*(?:vimeos\.net)[^\s"'<>]*/i);
  return genericMatch ? genericMatch[0] : null;
}

export function extractM3u8Stream(html: string): string | null {
  const match = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
  return match ? match[0] : null;
}

function parseCoordinates(
  link: string,
  options?: { season?: number; episode?: number }
): { slug: string; season: number; episode: number } | null {
  let season = options?.season;
  let episode = options?.episode;

  let urlObj: URL | null = null;
  try {
    urlObj = new URL(link, "https://serieslan.live");
  } catch {
    urlObj = null;
  }

  if (urlObj) {
    if (!season && urlObj.searchParams.has("season")) {
      season = parseInt(urlObj.searchParams.get("season")!, 10);
    }
    if (!episode && urlObj.searchParams.has("episode")) {
      episode = parseInt(urlObj.searchParams.get("episode")!, 10);
    }
  }

  // Extract slug from pathname (e.g. /serie/chicago-pd/player or /serie/chicago-pd/1/2)
  const pathname = urlObj ? urlObj.pathname : link;
  const pathParts = pathname.replace(/^\/+|\/+$/g, "").split("/");

  let slug = "";
  if (pathParts[0] === "serie" && pathParts.length > 1) {
    slug = pathParts[1];
  } else if (pathParts.length > 0) {
    slug = pathParts[0];
  }

  // Check if season and episode were in the path parts: /serie/{slug}/{season}/{episode}
  if (!season && pathParts.length >= 4) {
    const s = parseInt(pathParts[2], 10);
    const e = parseInt(pathParts[3], 10);
    if (!isNaN(s) && !isNaN(e)) {
      season = s;
      episode = e;
    }
  }

  if (!slug || !season || !episode) {
    return null;
  }

  return { slug, season, episode };
}

export class GetUrl implements StrategyGetMovieUrl {
  async operation(
    link: string,
    options?: {
      context?: Record<string, unknown>;
      season?: number;
      episode?: number;
    }
  ): Promise<MovieUrlResponse> {
    let playerUrl =
      typeof options?.context?.player_url === "string"
        ? options.context.player_url
        : null;

    if (!playerUrl) {
      const coords = parseCoordinates(link, options);
      if (!coords) {
        throw new SeriesLanError(
          `[SeriesLan] Invalid episode link or coordinates: "${link}"`
        );
      }

      let tmdbId = options?.context?.tmdb_id;
      if (!tmdbId) {
        const detail = await serieslanFetch<SeriesLanContentDetail>(
          `/api/rest/v1/content/serie/${coords.slug}`
        );
        tmdbId = detail.item?.tmdb_id;
      }

      if (!tmdbId) {
        throw new SeriesLanError(
          `[SeriesLan] Could not resolve TMDB ID for series: "${coords.slug}"`
        );
      }

      playerUrl = `${PLAYER_BASE}/e/tv/${tmdbId}/${coords.season}/${coords.episode}`;
    }

    // 1. Fetch player page
    const playerResponse = await fetch(playerUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://serieslan.live/",
      },
    });

    if (!playerResponse.ok) {
      throw new SeriesLanError(
        `[SeriesLan] Failed to fetch player at "${playerUrl}" with status ${playerResponse.status}`
      );
    }

    const playerHtml = await playerResponse.text();
    const vimeosUrl = extractVimeosIframe(playerHtml);

    if (!vimeosUrl) {
      throw new SeriesLanError(
        `[SeriesLan] No video embed iframe found in player page: "${playerUrl}"`
      );
    }

    // 2. Fetch vimeos embed
    const vimeosResponse = await fetch(vimeosUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://player.serieslan.live/",
      },
    });

    if (!vimeosResponse.ok) {
      throw new SeriesLanError(
        `[SeriesLan] Failed to fetch stream embed from "${vimeosUrl}" with status ${vimeosResponse.status}`
      );
    }

    const vimeosHtml = await vimeosResponse.text();
    const masterM3u8 = extractM3u8Stream(vimeosHtml);

    if (!masterM3u8) {
      throw new SeriesLanError(
        `[SeriesLan] No .m3u8 stream found in embed response: "${vimeosUrl}"`
      );
    }

    return {
      url: masterM3u8,
      quality: "auto",
      provider: "serieslan",
    };
  }
}
