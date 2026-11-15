import type { GetUrlOptions, StrategyGetUrl, Url } from "../../types/movie.ts";
import {
  persistUpstreamManifest,
  resolveCachedStream,
} from "../../services/stream-cache.service.ts";
import { extractNextData, poseidonFetch, resolvePoseidonPath } from "./client.ts";
import type {
  PoseidonPageProps,
  PoseidonVideoSource,
  PoseidonVideosMap,
} from "./types.ts";

/**
 * Filters the available video sources strictly for Latino audio tracks,
 * prioritizing the "vidara" cyberlocker for direct native HLS extraction.
 */
export function selectLatinoVideoSource(
  videos?: PoseidonVideosMap,
): PoseidonVideoSource | null {
  const latinoSources = videos?.latino || [];
  if (latinoSources.length === 0) {
    return null;
  }

  // Prioritize Vidara
  const vidaraSource = latinoSources.find(
    (s) => s.cyberlocker?.toLowerCase() === "vidara",
  );
  if (vidaraSource) {
    return vidaraSource;
  }

  // Return the first available Latino cyberlocker as fallback
  return latinoSources[0] || null;
}

/**
 * Extracts the Vidara filecode from the player HTML.
 * Matches patterns like:
 * var url = 'https://vidara.to/e/<filecode>';
 * or window.location = 'https://vidara.so/e/<filecode>';
 */
export function extractVidaraFilecode(html: string): string | null {
  const match =
    html.match(/https?:\/\/vidara\.[a-z0-9.]+\/e\/([a-zA-Z0-9_-]+)/i) ||
    html.match(/var\s+url\s*=\s*['"]https?:\/\/[^/]+\/e\/([a-zA-Z0-9_-]+)['"]/i);

  return match ? match[1] : null;
}

export class GetUrl implements StrategyGetUrl {
  async operation(path: string, options?: GetUrlOptions): Promise<Url> {
    const emptyUrl: Url = { url: null, fallbackUrl: null };

    // 1. Check if the stream is already cached in MinIO bucket or SQLite
    const cachedStream = await resolveCachedStream(path);
    if (cachedStream) {
      return cachedStream;
    }

    try {
      let videos: PoseidonVideosMap | undefined;

      // 2. Retrieve video sources from detailContext or fetch on-demand
      if (options?.detailContext?.videos) {
        videos = options.detailContext.videos as PoseidonVideosMap;
      } else {
        const resolvedPath = await resolvePoseidonPath(path);
        const cleanPath = resolvedPath.replace(/^\/+/, "");
        const response = await poseidonFetch(cleanPath);
        const html = await response.text();
        const nextData = extractNextData(html);

        videos =
          nextData?.props?.pageProps?.thisMovie?.videos ||
          nextData?.props?.pageProps?.episode?.videos;
      }

      // 3. Filter strictly for Latino audio
      const selectedSource = selectLatinoVideoSource(videos);
      if (!selectedSource || !selectedSource.result) {
        console.warn(`[Poseidon] No Latino stream available for path: ${path}`);
        return emptyUrl;
      }

      // 4. Resolve Vidara native HLS stream
      if (selectedSource.cyberlocker?.toLowerCase() === "vidara") {
        const playerUrl = selectedSource.result;
        const playerResponse = await fetch(playerUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Referer: "https://www.poseidonhd2.co/",
          },
        });

        if (!playerResponse.ok) {
          throw new Error(
            `Player response failed with status: ${playerResponse.status}`,
          );
        }

        const playerHtml = await playerResponse.text();
        const filecode = extractVidaraFilecode(playerHtml);

        if (!filecode) {
          throw new Error("Could not extract Vidara filecode from player HTML");
        }

        // Request master.m3u8 from Vidara's official streaming API
        const vidaraApiResponse = await fetch("https://vidara.to/api/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Referer: `https://vidara.to/e/${filecode}`,
            Origin: "https://vidara.to",
          },
          body: JSON.stringify({
            filecode,
            device: "web",
            codecs: [],
          }),
        });

        if (!vidaraApiResponse.ok) {
          throw new Error(
            `Vidara stream API returned status: ${vidaraApiResponse.status}`,
          );
        }

        const vidaraData = (await vidaraApiResponse.json()) as {
          streaming_url?: string;
        };

        if (vidaraData?.streaming_url) {
          const rawM3u8Url = vidaraData.streaming_url;

          // 5. Cache the stream in MinIO and SQLite via existing service
          const streamUrl = await persistUpstreamManifest(path, rawM3u8Url, {
            referer: "https://vidara.to/",
          });

          const finalUrl = streamUrl || rawM3u8Url;
          return {
            url: finalUrl,
            fallbackUrl: finalUrl,
          };
        }
      }

      return emptyUrl;
    } catch (error) {
      console.error(`[Poseidon] GetUrl operation failed for "${path}":`, error);
      return emptyUrl;
    }
  }
}
