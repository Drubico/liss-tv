import type { GetUrlOptions, StrategyGetUrl, Url } from "@/types/movie";
import { resolveCachedStream } from "@/services/stream-cache.service";
import { repelisFlareFetch } from "./client";
import { RepelisPlusError } from "./types";
import { resolveCyberlockerStream } from "./resolvers/index";
import * as cheerio from "cheerio";

export class GetUrl implements StrategyGetUrl {
  private readonly flareFetchFn: (url: string) => Promise<Response>;
  private readonly resolverFn: (url: string) => Promise<string | null>;

  constructor(
    flareFetchFn: (url: string) => Promise<Response> = repelisFlareFetch,
    resolverFn?: (url: string) => Promise<string | null>,
  ) {
    this.flareFetchFn = flareFetchFn;
    this.resolverFn =
      resolverFn ||
      (async (embedUrl: string) => {
        return resolveCyberlockerStream(embedUrl, async (u: string) => {
          const res = await this.flareFetchFn(u);
          return res.text();
        });
      });
  }

  async operation(path: string, options?: GetUrlOptions): Promise<Url> {
    // 1. Check if stream is already cached
    const cached = await resolveCachedStream(path);
    if (cached) {
      return cached;
    }

    // 2. Discover server embed URLs
    const contextServers = (options?.detailContext?.servers as string[] | undefined) || [];
    const serverUrls: string[] = [...contextServers];

    if (serverUrls.length === 0) {
      try {
        const res = await this.flareFetchFn(path);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);

          $("[data-server]").each((_, el) => {
            const s = $(el).attr("data-server");
            if (s && !serverUrls.includes(s)) {
              serverUrls.push(s);
            }
          });

          $("iframe[src]").each((_, el) => {
            const s = $(el).attr("src");
            if (s && !serverUrls.includes(s)) {
              serverUrls.push(s);
            }
          });
        }
      } catch (err) {
        console.warn(`[RepelisPlus] Failed to fetch watch page for "${path}":`, err);
      }
    }

    // 3. Resolve direct streams from server embeds
    const resolvedStreams: string[] = [];

    for (const serverUrl of serverUrls) {
      try {
        const directStream = await this.resolverFn(serverUrl);
        if (directStream && !resolvedStreams.includes(directStream)) {
          resolvedStreams.push(directStream);
          if (resolvedStreams.length >= 2) break; // Primary and fallback found
        }
      } catch (err) {
        console.warn(`[RepelisPlus] Failed resolving stream from "${serverUrl}":`, err);
      }
    }

    if (resolvedStreams.length > 0) {
      return {
        url: resolvedStreams[0],
        fallbackUrl: resolvedStreams[1] || undefined,
      };
    }

    throw new RepelisPlusError(
      `[RepelisPlus] No playable stream found for ${path}`,
      404,
    );
  }
}
