import * as cheerio from "cheerio";
import type { Episode, Season, StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import { seriesmetroFetch } from "./client";

export function parseSeriesmetroDetail(
  html: string,
  link: string
): Omit<StoredMovie, "link" | "updatedAt"> | undefined {
  const $ = cheerio.load(html);

  // 1. Title
  let title = $("h1.entry-title, h1.title, h1").first().text().trim();
  if (!title) {
    const ogTitle = $("meta[property='og:title']").attr("content");
    if (ogTitle) {
      title = ogTitle
        .replace(/\s*-\s*SeriesMetro.*$/i, "")
        .replace(/\s*online.*$/i, "")
        .trim();
    }
  }

  if (!title) return undefined;

  // Extract year from title if present
  let year = $(".entry-meta .year, .date").first().text().trim();
  const yearMatch = title.match(/\((\d{4})\)/);
  if (yearMatch) {
    if (!year) year = yearMatch[1];
    title = title.replace(/\s*\(\d{4}\)/, "").trim();
  }

  // 2. Poster and Backdrop
  let poster =
    $(".post-thumbnail figure img, .post-thumbnail img, figure img")
      .first()
      .attr("data-src") ||
    $(".post-thumbnail figure img, .post-thumbnail img, figure img")
      .first()
      .attr("src") ||
    $("meta[property='og:image']").attr("content") ||
    "";

  if (poster.startsWith("//")) {
    poster = `https:${poster}`;
  }

  const backdrop = $("meta[property='og:image']").attr("content") || poster;

  // 3. Synopsis
  const synopsis =
    $(".entry-content p, .description p, .description, .overview p, .overview")
      .first()
      .text()
      .trim() ||
    $("meta[property='og:description']").attr("content")?.trim() ||
    "";

  // 4. Rating & Genres
  const rating = $(".vote, .rating, .score").first().text().replace(/^TMDB\s*/i, "").trim();

  const tags: string[] = [];
  $(".genres a, .genre a, a[href*='/genero/']").each((_, el) => {
    const genre = $(el).text().trim();
    if (genre && !tags.includes(genre)) tags.push(genre);
  });

  const cleanLink = link.startsWith("http")
    ? new URL(link).pathname
    : link.startsWith("/")
    ? link
    : `/${link}`;

  const cleanSlug = cleanLink
    .replace(/^\/?(?:serie|pelicula)\//, "")
    .replace(/#.*$/, "")
    .replace(/\/+$/, "");

  const isSerie =
    cleanLink.includes("/serie/") ||
    $(".seasons, .season-list, a[href*='/capitulo/']").length > 0;

  // 5. Server embed options (for movies)
  const embeds: Array<{ index: number; language: string; url: string }> = [];

  $("aside.video-options ul.aa-tbs-video li a, ul.aa-tbs-video li a").each((i, el) => {
    const $a = $(el);
    const href = $a.attr("href") || `#options-${i}`;
    const targetId = href.replace(/^#/, "");
    const serverLabel = $a.find(".server").text().replace(/^-/, "").trim() || "Latino";

    // Locate iframe inside matching option container
    const iframeEl = $(`#${targetId} iframe`);
    const iframeSrc =
      iframeEl.attr("data-src") ||
      iframeEl.attr("src") ||
      "";

    embeds.push({
      index: i,
      language: serverLabel,
      url: iframeSrc,
    });
  });

  // Fallback if no tab markup exists but iframes exist
  if (embeds.length === 0) {
    $("iframe[src*='trembed'], iframe[data-src*='trembed']").each((i, ifr) => {
      const src = $(ifr).attr("data-src") || $(ifr).attr("src") || "";
      embeds.push({
        index: i,
        language: "Latino",
        url: src,
      });
    });
  }

  // 6. Episodes parsing (for series)
  const seasonsMap: Map<number, Episode[]> = new Map();

  if (isSerie) {
    $("a[href*='/capitulo/']").each((_, el) => {
      const $el = $(el);
      const epHref = $el.attr("href") || "";
      if (!epHref) return;

      const match =
        epHref.match(/temporada-(\d+)-capitulo-(\d+)/i) ||
        $el.text().match(/(\d+)x(\d+)/i) ||
        $el.text().match(/T(\d+)\s*E(\d+)/i);

      let seasonNum = 1;
      let epNum = "1";

      if (match) {
        seasonNum = parseInt(match[1], 10) || 1;
        epNum = match[2];
      }

      const epTitle =
        $el.find(".title, .ep-title, p").first().text().trim() ||
        $el.text().trim() ||
        `Episodio ${epNum}`;

      const cleanEpHref = epHref.startsWith("http")
        ? new URL(epHref).pathname
        : epHref.startsWith("/")
        ? epHref
        : `/${epHref}`;

      if (!seasonsMap.has(seasonNum)) {
        seasonsMap.set(seasonNum, []);
      }

      const existingList = seasonsMap.get(seasonNum)!;
      if (!existingList.some((e) => e.numberEpisode === epNum)) {
        existingList.push({
          numberEpisode: epNum,
          title: epTitle,
          image: poster,
          caption: "",
          link: cleanEpHref,
          context: {
            season: seasonNum,
            episode: parseInt(epNum, 10),
            slug: cleanSlug,
            provider: "seriesmetro",
          },
        });
      }
    });
  }

  const episodes: Season[] = Array.from(seasonsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([season, epList]) => ({
      season: String(season),
      episodes: epList.sort(
        (a, b) => parseInt(a.numberEpisode, 10) - parseInt(b.numberEpisode, 10)
      ),
    }));

  return {
    title,
    image: poster,
    backgroundImage: backdrop,
    type: isSerie ? "serie" : "movie",
    caption: synopsis || undefined,
    year: year || undefined,
    duration: undefined,
    tags: tags.length ? tags : undefined,
    episodes: isSerie && episodes.length ? episodes : undefined,
    provider: "seriesmetro",
    context: {
      slug: cleanSlug,
      embeds,
      isSerie,
    },
  };
}

export class GetDetail implements StrategyGetMovieDetails {
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = seriesmetroFetch as typeof fetch) {
    this.fetchFn = fetchFn;
  }

  async operation(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    const res = await this.fetchFn(link);
    const html = await res.text();
    return parseSeriesmetroDetail(html, link);
  }
}
