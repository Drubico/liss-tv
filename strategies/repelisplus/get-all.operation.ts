import * as cheerio from "cheerio";
import type { GetAllOptions, Movies, MediaItem, StrategyGetAllMovies } from "@/types/movie";
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

  async operation(options?: GetAllOptions): Promise<Movies | undefined> {
    const page = options?.pageNumber || 1;
    let endpoint = "/";

    if (options?.search && options.search.trim()) {
      const q = encodeURIComponent(options.search.trim());
      endpoint = `/busqueda?s=${q}`;
      if (page > 1) {
        endpoint += `&page=${page}`;
      }
    } else if (options?.slug) {
      const slug = options.slug.toLowerCase();
      if (slug === "series" || slug === "serie") {
        endpoint = page > 1 ? `/series/page/${page}` : `/series`;
      } else if (slug === "estrenos") {
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
          pagination: {
            page,
            limit: DEFAULT_PAGE_LIMIT,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: page > 1,
          },
        };
      }

      const html = await res.text();
      const movies = parseMovieItems(html);
      const hasNext = movies.length >= DEFAULT_PAGE_LIMIT;

      return {
        movies,
        pagination: {
          page,
          limit: DEFAULT_PAGE_LIMIT,
          total: movies.length,
          totalPages: hasNext ? page + 1 : page,
          hasNext,
          hasPrev: page > 1,
        },
      };
    } catch (err) {
      console.error("[RepelisPlus] GetAll operation failed:", err);
      return {
        movies: [],
        pagination: {
          page,
          limit: DEFAULT_PAGE_LIMIT,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: page > 1,
        },
      };
    }
  }
}
