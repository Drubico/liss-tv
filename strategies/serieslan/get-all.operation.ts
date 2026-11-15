import type { StrategyGetAllMovies } from "@/strategies/context";
import type { MovieItem, MovieResponse } from "@/types/movie";
import { serieslanFetch } from "./client";
import type {
  SeriesLanItem,
  SeriesLanListingResponse,
  SeriesLanSearchResponse,
} from "./types";

const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/original";

export function mapSeriesLanItemToMovie(item: SeriesLanItem): MovieItem {
  const poster = item.poster_path
    ? item.poster_path.startsWith("http")
      ? item.poster_path
      : `${TMDB_POSTER_BASE}${item.poster_path}`
    : "";

  const banner = item.backdrop_path
    ? item.backdrop_path.startsWith("http")
      ? item.backdrop_path
      : `${TMDB_BACKDROP_BASE}${item.backdrop_path}`
    : poster;

  return {
    id: item.slug,
    title: item.title,
    year: item.year ? String(item.year) : "",
    poster,
    banner,
    type: "serie",
    provider: "serieslan",
    rating: item.vote_average ? String(item.vote_average) : "",
    url: `/serie/${item.slug}`,
  };
}

export class GetAll implements StrategyGetAllMovies {
  async operation(
    search?: string,
    filter?: string,
    page: number = 1
  ): Promise<MovieResponse> {
    // If the consumer explicitly requested movies, return an empty array gracefully
    // since SeriesLan does not configure/support upstream movies.
    if (filter === "movies" || filter === "movie" || filter === "pelicula") {
      return {
        movies: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
          total: 0,
        },
      };
    }

    // 1. Search Query
    if (search && search.trim().length > 0) {
      const searchUrl = `/api/rest/v1/search?q=${encodeURIComponent(
        search.trim()
      )}&page=${page}`;
      const res = await serieslanFetch<SeriesLanSearchResponse>(searchUrl);
      const items = res.items || [];
      const pagination = res.pagination;

      return {
        movies: items.map(mapSeriesLanItemToMovie),
        pagination: {
          currentPage: pagination?.page ?? page,
          totalPages: pagination?.total_pages ?? 1,
          hasNextPage: pagination?.has_next ?? false,
          hasPrevPage: pagination?.has_prev ?? false,
          total: pagination?.total ?? items.length,
        },
      };
    }

    // 2. Listing Catalog (Series)
    const listUrl = `/api/rest/v1/listing?kind=series&order=recent&page=${page}`;
    const res = await serieslanFetch<SeriesLanListingResponse>(listUrl);
    const items = res.items || [];
    const pagination = res.pagination;

    return {
      movies: items.map(mapSeriesLanItemToMovie),
      pagination: {
        currentPage: pagination?.page ?? page,
        totalPages: pagination?.total_pages ?? 1,
        hasNextPage: pagination?.has_next ?? false,
        hasPrevPage: pagination?.has_prev ?? false,
        total: pagination?.total ?? items.length,
      },
    };
  }
}
