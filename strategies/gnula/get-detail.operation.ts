import * as cheerio from "cheerio";
import type { Episode, Season, StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import { get, upsert } from "@/services/movie.store";
import { gnulaFetch } from "./client";

const CACHE_TTL_DAYS = 7;

function isCacheExpired(dateString: string, maxAgeDays: number): boolean {
  const ageInDays = (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24);
  return ageInDays > maxAgeDays;
}

function getDetailCandidatePaths(link: string): string[] {
  if (link.startsWith("http://") || link.startsWith("https://")) {
    return [link];
  }
  const clean = link.replace(/^\/+/, "").replace(/\/+$/, "");
  const slug = clean.replace(/^(?:ver|pelicula|serie)\//, "");
  return [
    `ver/${slug}/`,
    `${slug}/`,
    `pelicula/${slug}/`,
    `serie/${slug}/`,
  ];
}

function extractGnulaContext($: cheerio.CheerioAPI): Record<string, unknown> {
  const context: Record<string, unknown> = {};

  // Extract post or media ID from element data attributes
  const dataId = $("[data-id]").first().attr("data-id");
  if (dataId) {
    context.id = dataId;
  }

  // Extract streaming resolve tokens from embedded inline scripts
  $("script").each((_, el) => {
    const text = $(el).html() || "";
    if (text.includes("the-tube-resolve") || text.includes("vidara-resolve") || text.includes("AUTH=")) {
      const authMatch = text.match(/[&?]t=([a-f0-9]+)/i);
      if (authMatch && !context.t) {
        context.t = authMatch[1];
      }
      const resolveMatch = text.match(/RESOLVE\s*=\s*['"]([^'"]+)['"]/);
      if (resolveMatch && !context.resolveEndpoint) {
        context.resolveEndpoint = resolveMatch[1];
      }
    }
  });

  return context;
}

function extractTitle($: cheerio.CheerioAPI): string {
  const titleFromSr = $(
    "h1.gnrd-fi-title .gnrd-sr, h1.entry-title .gnrd-sr, h1.title .gnrd-sr",
  )
    .first()
    .text()
    .trim();
  if (titleFromSr) return titleFromSr;

  const altFromImg = $(
    "h1.gnrd-fi-title img, h1.entry-title img, h1.title img",
  )
    .first()
    .attr("alt")
    ?.trim();
  if (altFromImg) return altFromImg;

  const h1 = $("h1.gnrd-fi-title, h1.entry-title, h1.title, .gnrd-title, h1")
    .first()
    .text()
    .trim();
  if (h1) return h1;

  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  if (ogTitle) {
    return ogTitle
      .replace(/^Ver\s+/i, "")
      .replace(/\s*\(\d{4}\).*$/i, "")
      .replace(/\s*online.*$/i, "")
      .replace(/\s*-\s*gnula.*$/i, "")
      .trim();
  }

  const rawTitle = $("title").text().trim();
  if (rawTitle) {
    return rawTitle
      .replace(/^Ver\s+/i, "")
      .replace(/\s*\(\d{4}\).*$/i, "")
      .replace(/\s*online.*$/i, "")
      .replace(/\s*-\s*gnula.*$/i, "")
      .trim();
  }

  return "";
}

function extractBackdrop($: cheerio.CheerioAPI): string {
  const bgStyle = $(".gnrd-fi-bg, .backdrop, .cover").attr("style") || "";
  const bgMatch = bgStyle.match(/url\(['"]?([^'"]+?)['"]?\)/);
  let backgroundImage = bgMatch?.[1]?.trim() ?? "";

  if (!backgroundImage) {
    const ogImage = $('meta[property="og:image"]').attr("content")?.trim();
    if (ogImage) backgroundImage = ogImage;
  }

  // Prefer original resolution for TMDB images
  if (backgroundImage.includes("image.tmdb.org")) {
    backgroundImage = backgroundImage.replace(/\/w\d+\//, "/original/");
  }
  return backgroundImage;
}

function extractPoster($: cheerio.CheerioAPI, fallbackBackdrop: string): string {
  return (
    $('meta[itemprop="image"]').attr("content") ||
    $('meta[property="og:image"]').attr("content") ||
    $("img.gnrd-fi-logo, .poster img, .movie-poster img, .item-cover img").attr("src") ||
    fallbackBackdrop ||
    ""
  );
}

function extractYear($: cheerio.CheerioAPI): string {
  let year = "";
  $(".gnrd-fi-meta span, .gnrd-eyebrow, .year, .release-year, a[href*='/year/']").each((_, el) => {
    const text = $(el).text().trim();
    const match = text.match(/\b(19\d\d|20\d\d)\b/);
    if (match && !year) {
      year = match[0];
    }
  });
  return year;
}

function extractDuration($: cheerio.CheerioAPI): string {
  let duration = "";
  $(".gnrd-fi-meta span, .duration, .runtime").each((_, el) => {
    const text = $(el).text().trim();
    if (/\b\d+\s*(?:hr|min|m|h)\b/i.test(text)) {
      duration = text;
    }
  });
  return duration;
}

function extractSeasons(
  $: cheerio.CheerioAPI,
  fallbackImage: string,
  baseContext: Record<string, unknown>,
): Season[] {
  const seasonsMap = new Map<string, Episode[]>();

  $("a.gnrd-epc").each((_, el) => {
    const href = $(el).attr("href") || "";
    const seasonAttr = $(el).attr("data-s");
    const epAttr = $(el).attr("data-e");

    const epCode = $(el).find(".gnrd-epc-n").text().trim();
    const codeMatch = epCode.match(/^(\d+)x(\d+)$/i);

    const seasonNum = seasonAttr || (codeMatch ? codeMatch[1] : "1");
    const epNum = epAttr || (codeMatch ? codeMatch[2] : "1");

    const thumbStyle = $(el).find(".gnrd-epc-thumb").attr("style") || "";
    const thumbMatch = thumbStyle.match(/url\(['"]?([^'"]+?)['"]?\)/);
    const epThumb =
      thumbMatch?.[1]?.trim() || $(el).find("img").attr("src") || fallbackImage;

    const epTitle =
      $(el).find(".gnrd-epc-title").text().trim() || `Episodio ${epNum}`;
    const epDate = $(el).find(".gnrd-epc-date").text().trim();
    const epDur = $(el).find(".gnrd-epc-dur").text().trim();
    const epCaption = [epDate, epDur].filter(Boolean).join(" · ");

    const pathMatch = href.match(/https?:\/\/[^/]+(\/[^?#]+)/);
    const cleanedLink = pathMatch ? pathMatch[1] : href;

    const episode: Episode = {
      link: cleanedLink,
      title: epTitle,
      image: epThumb,
      numberEpisode: epNum,
      caption: epCaption,
      context: {
        ...baseContext,
        season: seasonNum,
        episode: epNum,
        provider: "gnula",
      },
    };

    if (!seasonsMap.has(seasonNum)) {
      seasonsMap.set(seasonNum, []);
    }
    seasonsMap.get(seasonNum)!.push(episode);
  });

  return Array.from(seasonsMap.entries()).map(([season, episodes]) => ({
    season,
    episodes: episodes.sort(
      (a, b) => parseInt(a.numberEpisode, 10) - parseInt(b.numberEpisode, 10),
    ),
  }));
}

export class GetDetail implements StrategyGetMovieDetails {
  private readonly fetchFn: typeof gnulaFetch;

  constructor(fetchFn: typeof gnulaFetch = gnulaFetch) {
    this.fetchFn = fetchFn;
  }

  async operation(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    const cached = get("gnula", link);
    const isSerie = link.includes("serie");

    if (
      cached?.title &&
      cached?.image &&
      cached?.backgroundImage &&
      !isCacheExpired(cached.updatedAt, CACHE_TTL_DAYS) &&
      (!isSerie || cached?.episodes?.length)
    ) {
      return {
        backgroundImage: cached.backgroundImage ?? "",
        image: cached.image,
        title: cached.title,
        year: cached.year ?? "",
        duration: cached.duration ?? "",
        rating: cached.rating ?? "",
        tags: cached.tags ?? [],
        caption: cached.caption ?? "",
        episodes: cached.episodes ?? [],
        context: cached.context,
      };
    }

    try {
      const candidates = getDetailCandidatePaths(link);
      let response: Awaited<ReturnType<typeof this.fetchFn>> | undefined;
      let matchedEndpoint = "";

      for (const ep of candidates) {
        try {
          const res = await this.fetchFn(ep, {
            headers: {
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          });
          if (res.ok) {
            response = res;
            matchedEndpoint = ep;
            break;
          }
        } catch {
          // Continue to next candidate
        }
      }

      if (!response || !response.ok) {
        return undefined;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const gnulaContext = extractGnulaContext($);
      let title = extractTitle($);
      if (!title || title.trim() === "") {
        const cleanSlug = link
          .replace(/[?#].*$/, "")
          .replace(/^https?:\/\/[^/]+/, "")
          .replace(/^\/+/, "")
          .replace(/^(?:ver|pelicula|serie)\//, "")
          .replace(/\/+$/, "");
        title = cleanSlug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      }

      const backdrop = extractBackdrop($);
      const poster = extractPoster($, backdrop);
      const image = poster || backdrop;
      const backgroundImage = backdrop || image;

      const ratingRaw = $(
        ".gnrd-rating, .gnrd-cm-rating, .rating, .rating-badge, .imdb",
      )
        .first()
        .text()
        .trim();
      const rating = ratingRaw.replace(/^★\s*/, "");

      const year = extractYear($);
      const duration = extractDuration($);

      const tags = $(
        ".gnrd-fi-genres a, .gnrd-fi-genres span, .genres a, .genre a",
      )
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean);

      const caption = $(
        "p.gnrd-fi-syn, #gnrd-syn, p[itemprop='description'], .entry-content p, .overview, .description p, .desc",
      )
        .first()
        .text()
        .trim();

      const seasons = extractSeasons($, image, gnulaContext);

      const movieData: Omit<StoredMovie, "link" | "updatedAt"> = {
        title,
        image,
        backgroundImage,
        rating,
        year,
        duration,
        tags,
        caption,
        provider: "gnula",
        episodes: seasons.length > 0 ? seasons : undefined,
        context: Object.keys(gnulaContext).length > 0 ? { ...gnulaContext, provider: "gnula" } : { provider: "gnula" },
      };

      upsert("gnula", link, movieData);
      return movieData;
    } catch (error) {
      console.error("[Gnula] GetDetail operation failed:", error);
      return undefined;
    }
  }
}
