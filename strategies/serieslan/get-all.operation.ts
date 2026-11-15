import type { StrategyGetAllMovies, Movies, MediaItem } from "@/types/movie";
import { serieslanFetch } from "./client";
import type {
  SeriesLanItem,
  SeriesLanListingResponse,
  SeriesLanSearchResponse,
} from "./types";

const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/original";

export function mapSeriesLanItemToMovie(item: SeriesLanItem): MediaItem {
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
    image: poster,
    link: `/serie/${item.slug}`,
    type: "serie",
    provider: "serieslan",
    rating: item.vote_average ? String(item.vote_average) : "",
    context: {
      backgroundImage: banner,
      catalog_item_id: item.catalog_item_id,
    },
  };
}

export class GetAll implements StrategyGetAllMovies {
  async operation(
    search?: string,
    slug?: string,
    pageNumber: number = 1
  ): Promise<Movies | undefined> {
    // If the consumer explicitly requested movies, return an empty array gracefully
    // since SeriesLan does not configure/support upstream movies.
    if (slug === "movies" || slug === "movie" || slug === "pelicula") {
      return {
        movies: [],
        lastPageNumber: 0,
        hasMore: false,
      };
    }

    // 1. Search Query
    if (search && search.trim().length > 0) {
      const searchUrl = `/api/rest/v1/search?q=${encodeURIComponent(
        search.trim()
      )}&page=${pageNumber}`;
      const res = await serieslanFetch<SeriesLanSearchResponse>(searchUrl);
      const items = res.items || [];
      const pagination = res.pagination;

      return {
        movies: items.map(mapSeriesLanItemToMovie),
        lastPageNumber: pagination?.total_pages ?? 1,
        hasMore: pagination?.has_next ?? false,
      };
    }

    // 2. Listing Catalog (Series)
    const listUrl = `/api/rest/v1/listing?kind=series&order=recent&page=${pageNumber}`;
    const res = await serieslanFetch<SeriesLanListingResponse>(listUrl);
    const items = res.items || [];
    const pagination = res.pagination;

    return {
      movies: items.map(mapSeriesLanItemToMovie),
      lastPageNumber: pagination?.total_pages ?? 1,
      hasMore: pagination?.has_next ?? false,
    };
  }
}
