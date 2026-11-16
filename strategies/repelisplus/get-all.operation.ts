import * as cheerio from "cheerio";
import type { DriverQuery, Movies, MediaItem, StrategyGetAllMovies } from "@/types/movie";
import { repelisFetch } from "./client";
import { parseMovieCard } from "./mappers";

const DEFAULT_PAGE_LIMIT = 24;

export function parseMovieItems(html: string): MediaItem[] {
  const $ = cheerio.load(html);
  const items: MediaItem[] = [];

  $(".movie-item").each((_, el) => {
    const item = parseMovieCard($, el);
    if (item) {
      items.push(item);
    }
  });

  return items;
}

export class GetAll implements StrategyGetAllMovies {
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = repelisFetch as unknown as typeof fetch) {
    this.fetchFn = fetchFn;
  }

  async operation(
    searchOrQuery?: string | DriverQuery,
    slugParam?: string,
    pageParam?: number,
  ): Promise<Movies | undefined> {
    const search =
      typeof searchOrQuery === "string" ? searchOrQuery : searchOrQuery?.search;
    const slug =
      typeof searchOrQuery === "object" && searchOrQuery !== null
        ? searchOrQuery.slug
        : slugParam;
    const page =
      typeof searchOrQuery === "object" && searchOrQuery !== null
        ? searchOrQuery.pageNumber || 1
        : pageParam || 1;

    let endpoint = "/";

    if (search && search.trim()) {
      const q = encodeURIComponent(search.trim());
      endpoint = `/busqueda?s=${q}`;
      if (page > 1) {
        endpoint += `&page=${page}`;
      }
    } else if (slug) {
      const cleanSlug = slug.toLowerCase();
      if (cleanSlug === "series" || cleanSlug === "serie") {
        endpoint = page > 1 ? `/series/page/${page}` : `/series`;
      } else if (cleanSlug === "estrenos") {
        endpoint = page > 1 ? `/peliculas/estrenos/page/${page}` : `/peliculas/estrenos`;
      } else {
        endpoint = page > 1 ? `/peliculas/page/${page}` : `/peliculas`;
      }
    } else if (page > 1) {
      endpoint = `/peliculas/page/${page}`;
    }

    try {
      const res = await this.fetchFn(endpoint);
      if (!res.ok) {
        return {
          movies: [],
          lastPageNumber: 1,
          hasMore: false,
        };
      }

      const html = await res.text();
      const movies = parseMovieItems(html);
      const hasNext = movies.length >= DEFAULT_PAGE_LIMIT;

      return {
        movies,
        lastPageNumber: hasNext ? page + 1 : page,
        hasMore: hasNext,
      };
    } catch (err) {
      console.error("[RepelisPlus] GetAll operation failed:", err);
      return {
        movies: [],
        lastPageNumber: 1,
        hasMore: false,
      };
    }
  }
}
