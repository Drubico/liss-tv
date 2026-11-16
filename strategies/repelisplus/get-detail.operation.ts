import * as cheerio from "cheerio";
import type { Episode, Season, StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import { get, upsert } from "@/services/movie.store";
import { repelisFlareFetch } from "./client";
import { normalizeUrl, cleanLinkToPath } from "./mappers";

const CACHE_TTL_DAYS = 7;

function isCacheExpired(dateString: string, maxAgeDays: number): boolean {
  const ageInDays = (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24);
  return ageInDays > maxAgeDays;
}

function unwrapIframeUrl(url: string): string {
  if (url.includes("iframe/?url=")) {
    try {
      const parsed = new URL(url);
      const nested = parsed.searchParams.get("url");
      if (nested && nested.startsWith("http")) return nested;
    } catch {
      // URL parsing failed
    }
  }
  return url;
}

export function decodeServerLink(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return unwrapIframeUrl(trimmed);
  }
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf-8").trim();
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
      return unwrapIframeUrl(decoded);
    }
  } catch {
    // Decoding failure, keep raw
  }
  return trimmed;
}

export function parseDetailHtml(
  html: string,
  link: string,
): Omit<StoredMovie, "link" | "updatedAt"> {
  const $ = cheerio.load(html);

  const rawTitle =
    $("[itemprop='name']").first().text().trim() ||
    $("h1.title, h1").first().text().trim() ||
    $(".item-detail p").first().text().trim();
  const title = rawTitle.replace(/^Ver\s+(?:Película|Pelicula|Serie)\s+/i, "").trim();

  const rawPoster =
    $("figure.poster img, .poster img, [itemprop='image']")
      .not(".logo, .logo-image, [src*='logo']")
      .first()
      .attr("src") ||
    $("figure img, .item-picture img")
      .not(".logo, .logo-image, [src*='logo']")
      .first()
      .attr("src") ||
    "";
  const image = normalizeUrl(rawPoster) || "/logo-with-background.png";

  let rawBackdrop = "";
  const backdropEl = $(".backdrop-image, .video-play, .card-hover-backdrop, [data-backdrop]").first();
  const dataAttr = backdropEl.attr("data-backdrop");
  if (dataAttr) {
    rawBackdrop = dataAttr;
  } else {
    const style = backdropEl.attr("style") || "";
    const bgMatch = style.match(/url\(['"]?(.*?)['"]?\)/i);
    if (bgMatch && bgMatch[1] && !bgMatch[1].includes("play.png") && !bgMatch[1].includes("logo")) {
      rawBackdrop = bgMatch[1];
    }
  }
  const backgroundImage = normalizeUrl(rawBackdrop) || image;

  const caption =
    $(".description p, [itemprop='description'] p, .overview, .sinopsis, p.caption, .card-hover-info-overview p")
      .first()
      .text()
      .trim() ||
    $(".description, [itemprop='description']").first().text().trim();

  const year =
    $("[itemprop='datePublished'], .year").first().text().trim() ||
    $(".meta").text().match(/\b(19\d\d|20\d\d)\b/)?.[1] ||
    "";

  const ratingRaw = $(".rating, .score-rating, .card-hover-rating").first().text().trim();
  const rating = ratingRaw.replace(/^[☆★\s]+|[☆★\s]+$/g, "");

  const tags = $("[itemprop='genre'], .genres li, .card-hover-info-genre li, .tag")
    .map((_, el) => $(el).text().replace(/,\s*$/, "").trim())
    .get()
    .filter(Boolean);

  // Extract server links if present and decode base64
  const serverLinks: string[] = [];
  $("[data-server]").each((_, el) => {
    const s = $(el).attr("data-server");
    if (s) {
      const decoded = decodeServerLink(s);
      if (decoded && !serverLinks.includes(decoded)) {
        serverLinks.push(decoded);
      }
    }
  });
  $("iframe[src]").each((_, el) => {
    const s = $(el).attr("src");
    if (s) {
      const decoded = decodeServerLink(s);
      if (decoded && !serverLinks.includes(decoded)) {
        serverLinks.push(decoded);
      }
    }
  });

  // Extract seasons and episodes if it is a series
  const seasonsMap = new Map<string, Episode[]>();

  $(".season-block, [data-season]").each((_, sEl) => {
    const seasonAttr = $(sEl).attr("data-season") || "1";
    const seasonNum = String(parseInt(seasonAttr, 10) || 1);

    $(sEl)
      .find(".episode-item, [data-episode]")
      .each((_, epEl) => {
        const epAttr = $(epEl).attr("data-episode") || "1";
        const epNum = String(parseInt(epAttr, 10) || 1);
        const epLinkRaw = $(epEl).find("a").attr("href") || link;
        const epLink = cleanLinkToPath(epLinkRaw);
        const epTitle =
          $(epEl).find(".episode-title, a").text().trim() || `Episodio ${epNum}`;
        const epRawImg = $(epEl).find("img").attr("src");
        const epImage = normalizeUrl(epRawImg) || image;

        const episode: Episode = {
          link: epLink,
          title: epTitle,
          image: epImage,
          numberEpisode: epNum,
          caption: "",
          context: {
            provider: "repelisplus",
            season: seasonNum,
            episode: epNum,
            slug: link,
            serverLinks: serverLinks.length > 0 ? serverLinks : undefined,
          },
        };

        if (!seasonsMap.has(seasonNum)) {
          seasonsMap.set(seasonNum, []);
        }
        seasonsMap.get(seasonNum)!.push(episode);
      });
  });

  const seasons: Season[] = Array.from(seasonsMap.entries()).map(
    ([season, episodes]) => ({
      season,
      episodes: episodes.sort(
        (a, b) => parseInt(a.numberEpisode, 10) - parseInt(b.numberEpisode, 10),
      ),
    }),
  );

  return {
    title,
    image,
    backgroundImage,
    caption,
    year: year || undefined,
    rating: rating || undefined,
    tags: tags.length > 0 ? tags : undefined,
    provider: "repelisplus",
    episodes: seasons.length > 0 ? seasons : undefined,
    context: {
      provider: "repelisplus",
      slug: link,
      servers: serverLinks.length > 0 ? serverLinks : undefined,
    },
  };
}

export class GetDetail implements StrategyGetMovieDetails {
  private readonly flareFetchFn: (url: string) => Promise<Response>;

  constructor(
    flareFetchFn: (url: string) => Promise<Response> = repelisFlareFetch,
  ) {
    this.flareFetchFn = flareFetchFn;
  }

  async operation(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    const cached = get(link);
    const isSerie = link.includes("serie");
    const hasBadLogoImage =
      cached?.backgroundImage?.includes("repelisplus-logo.png") ||
      cached?.image?.includes("repelisplus-logo.png");

    if (
      !hasBadLogoImage &&
      cached?.title &&
      cached?.image &&
      cached?.backgroundImage &&
      !isCacheExpired(cached.updatedAt, CACHE_TTL_DAYS) &&
      (!isSerie || cached?.episodes?.length)
    ) {
      return {
        ...cached,
        provider: "repelisplus",
      };
    }

    try {
      const res = await this.flareFetchFn(link);
      if (!res.ok) {
        return undefined;
      }

      const html = await res.text();
      const parsed = parseDetailHtml(html, link);

      upsert(link, parsed);

      return parsed;
    } catch (err) {
      console.error(`[RepelisPlus] GetDetail failed for "${link}":`, err);
      return undefined;
    }
  }
}
