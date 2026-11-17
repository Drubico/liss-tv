import * as cheerio from "cheerio";
import type { MediaItem, Movies, StrategyGetAllMovies } from "@/types/movie";
import { megadedeFetch } from "./client";

export function parseMegadedeCatalog(html: string, currentPage = 1): Movies {
  const $ = cheerio.load(html);
  const movies: MediaItem[] = [];

  $("article.mv, article.item, article.film, article.card").each((_, el) => {
    const $el = $(el);
    const linkEl = $el.find("h2.entry-title a, .title a, a[href*='/pelicula/'], a[href*='/serie/']").first();
    const link = linkEl.attr("href") || "";
    const title = linkEl.text().trim() || $el.find("img").attr("alt")?.trim() || "";

    if (!link || !title) return;

    let image = $el.find("figure img, img").attr("src") || "";
    if (image.startsWith("//")) {
      image = `https:${image}`;
    }

    const year = $el.find(".year, .release-year, .date").text().trim();
    const rating = $el.find(".rating, .vote, .imdb").text().trim();
    const isSerie = link.includes("/serie/");

    movies.push({
      id: link.replace(/^\/(?:pelicula|serie)\//, "").replace(/\/+$/, ""),
      link,
      title,
      image,
      year,
      rating,
      type: isSerie ? "serie" : "movie",
      provider: "megadede",
    });
  });

  let maxPage = currentPage;
  $("a.page-numbers, .pagination a").each((_, el) => {
    const text = $(el).text().trim();
    const pageNum = parseInt(text, 10);
    if (!isNaN(pageNum) && pageNum > maxPage) {
      maxPage = pageNum;
    }
    const href = $(el).attr("href") || "";
    const match = href.match(/[?&]page=(\d+)/);
    if (match) {
      const p = parseInt(match[1], 10);
      if (!isNaN(p) && p > maxPage) maxPage = p;
    }
  });

  return {
    movies,
    lastPageNumber: maxPage,
    hasMore: maxPage > currentPage,
  };
}

export class GetAll implements StrategyGetAllMovies {
  async operation(
    search?: string,
    slug?: string,
    pageNumber = 1
  ): Promise<Movies | undefined> {
    let endpoint = "";

    if (search && search.trim() !== "") {
      endpoint = `/search?s=${encodeURIComponent(search.trim())}&page=${pageNumber}`;
    } else if (slug === "series") {
      endpoint = `/series?page=${pageNumber}`;
    } else if (slug && slug !== "" && slug !== "home" && slug !== "movies") {
      endpoint = `/${slug.replace(/^\/+/, "")}?page=${pageNumber}`;
    } else {
      endpoint = `/peliculas?page=${pageNumber}`;
    }

    try {
      const res = await megadedeFetch(endpoint);
      const html = await res.text();
      return parseMegadedeCatalog(html, pageNumber);
    } catch {
      // If /search?s= fails on certain ToroVid mirrors, fallback to /?s=
      if (search && search.trim() !== "") {
        try {
          const fallbackEndpoint = `/?s=${encodeURIComponent(search.trim())}&page=${pageNumber}`;
          const res = await megadedeFetch(fallbackEndpoint);
          const html = await res.text();
          return parseMegadedeCatalog(html, pageNumber);
        } catch {
          return undefined;
        }
      }
      return undefined;
    }
  }
}
