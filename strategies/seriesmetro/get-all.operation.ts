import * as cheerio from "cheerio";
import type { MediaItem, Movies, StrategyGetAllMovies } from "@/types/movie";
import { upsert } from "@/services/movie.store";
import { seriesmetroFetch } from "./client";

export function parseSeriesmetroCatalog(html: string, currentPage = 1): Movies {
  const $ = cheerio.load(html);
  const movies: MediaItem[] = [];

  $("article.post, li.post-item, div.item").each((_, el) => {
    const $el = $(el);
    const linkEl = $el.find("a[href*='/pelicula/'], a[href*='/serie/']").first();
    const rawHref = linkEl.attr("href") || $el.find("a").first().attr("href") || "";

    if (!rawHref) return;

    // Normalize URL path
    let url = rawHref;
    try {
      if (rawHref.startsWith("http")) {
        const parsed = new URL(rawHref);
        url = parsed.pathname;
      }
    } catch {
      // keep rawHref if unparseable
    }

    if (!url.startsWith("/")) {
      url = `/${url}`;
    }

    // Determine type strictly by link path to avoid Torofilm CSS class ambiguity
    const isSerie = url.includes("/serie/");
    const mediaType: "movie" | "serie" = isSerie ? "serie" : "movie";

    // Extract title
    let rawTitle =
      $el.find(".entry-title, h2, h3, header h2").first().text().trim() ||
      $el.find("figure img, img").attr("alt")?.trim() ||
      linkEl.attr("title")?.trim() ||
      "";

    // Extract year from title if present, e.g. "Scream 3 (2000)"
    let year = $el.find(".year, .entry-meta .year").first().text().trim();
    const yearMatch = rawTitle.match(/\((\d{4})\)/);
    if (yearMatch) {
      if (!year) year = yearMatch[1];
      rawTitle = rawTitle.replace(/\s*\(\d{4}\)/, "").trim();
    }

    if (!rawTitle) return;

    // Extract rating
    let rating = $el.find(".vote, .rating, .score").first().text().trim();
    rating = rating.replace(/^TMDB\s*/i, "").trim();

    // Extract poster image
    const imgEl = $el.find("figure img, img").first();
    let image =
      imgEl.attr("data-src") ||
      imgEl.attr("data-lazy-src") ||
      imgEl.attr("src") ||
      "";

    if (image.startsWith("//")) {
      image = `https:${image}`;
    }

    // Generate unique slug id
    const cleanSlug = url
      .replace(/^\/?(?:pelicula|serie)\//, "")
      .replace(/\/+$/, "");

    movies.push({
      id: cleanSlug || url,
      title: rawTitle,
      link: url,
      image,
      year: year || "",
      rating: rating || "",
      type: mediaType,
      provider: "seriesmetro",
      context: {
        provider: "seriesmetro",
        slug: cleanSlug,
      },
    });
  });

  // Parse pagination
  let totalPages = currentPage;
  $(".pagination .page-link, .pagination a").each((_, pageEl) => {
    const pageNum = parseInt($(pageEl).text().trim(), 10);
    if (!isNaN(pageNum) && pageNum > totalPages) {
      totalPages = pageNum;
    }
  });

  const hasNext =
    $(".pagination .next, .pagination a.next").length > 0 ||
    totalPages > currentPage;

  return {
    movies,
    lastPageNumber: totalPages,
    hasMore: hasNext,
  };
}

export class GetAll implements StrategyGetAllMovies {
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = seriesmetroFetch as typeof fetch) {
    this.fetchFn = fetchFn;
  }

  async operation(
    search?: string,
    slug?: string,
    pageNumber: number = 1
  ): Promise<Movies | undefined> {
    const page = pageNumber || 1;
    let targetEndpoint: string;

    if (search) {
      const searchParam = encodeURIComponent(search.trim());
      targetEndpoint =
        page > 1
          ? `/?s=${searchParam}&page=${page}`
          : `/?s=${searchParam}`;
    } else if (slug === "series" || slug === "serie") {
      targetEndpoint =
        page > 1
          ? `/cartelera-series/page/${page}/`
          : `/cartelera-series/`;
    } else {
      // Default or "movies" / "movie" / "pelicula"
      targetEndpoint =
        page > 1
          ? `/cartelera-peliculas/page/${page}/`
          : `/cartelera-peliculas/`;
    }

    const res = await this.fetchFn(targetEndpoint);
    const html = await res.text();
    const result = parseSeriesmetroCatalog(html, page);

    for (const m of result.movies) {
      if (m.link) {
        const cleanLink = m.link.replace(/\/+$/, "");
        const payload = {
          title: m.title,
          image: m.image,
          rating: m.rating,
          year: m.year,
          type: m.type,
          provider: "seriesmetro",
          context: m.context,
        };
        upsert("seriesmetro", cleanLink, payload);
        if (m.link !== cleanLink) {
          upsert("seriesmetro", m.link, payload);
        }
      }
    }

    return result;
  }
}
